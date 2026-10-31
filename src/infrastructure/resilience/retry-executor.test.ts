import { runWithRetry } from './retry-executor';
import type { RetryObservation } from './retry-executor';

const retryable = (): 503 => 503;

describe('runWithRetry', () => {
  it('no espera cuando el primer intento sale bien', async () => {
    const sleeps: number[] = [];
    const outcome = await runWithRetry({
      method: 'GET',
      execute: async () => 'ok',
      classify: retryable,
      sleep: async (ms) => { sleeps.push(ms); },
    });

    expect(outcome).toMatchObject({ ok: true, value: 'ok', attempts: 1 });
    expect(sleeps).toEqual([]);
  });

  it('reintenta transitorios con la misma operación y espera progresiva', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const keys: string[] = [];
    const outcome = await runWithRetry({
      method: 'POST',
      idempotencyKey: 'resolve-campus-inc-001-op-1',
      execute: async () => {
        calls += 1;
        keys.push('resolve-campus-inc-001-op-1');
        if (calls < 3) throw new Error('transitorio');
        return 'confirmado';
      },
      classify: retryable,
      sleep: async (ms) => { sleeps.push(ms); },
    });

    expect(outcome).toMatchObject({ ok: true, value: 'confirmado', attempts: 3 });
    expect(sleeps).toEqual([500, 1_000]);
    expect(new Set(keys).size).toBe(1);
  });

  it('se detiene en el límite publicado: 4 intentos y 3 esperas', async () => {
    const sleeps: number[] = [];
    const outcome = await runWithRetry({
      method: 'GET',
      execute: async () => { throw new Error('sigue fallando'); },
      classify: retryable,
      sleep: async (ms) => { sleeps.push(ms); },
    });

    expect(outcome).toMatchObject({ ok: false, attempts: 4 });
    expect(sleeps).toEqual([500, 1_000, 2_000]);
  });

  it('no repite un POST sin clave estable ni un fallo no reintentable', async () => {
    let sinClave = 0;
    const post = await runWithRetry({
      method: 'POST',
      execute: async () => { sinClave += 1; throw new Error('timeout'); },
      classify: () => 'timeout',
      sleep: async () => undefined,
    });
    expect(post).toMatchObject({ ok: false, attempts: 1 });
    expect(sinClave).toBe(1);

    let noReintentable = 0;
    const fatal = await runWithRetry({
      method: 'GET',
      execute: async () => { noReintentable += 1; throw new Error('validación'); },
      classify: () => null,
      sleep: async () => undefined,
    });
    expect(fatal).toMatchObject({ ok: false, attempts: 1 });
    expect(noReintentable).toBe(1);
  });

  it('respeta Retry-After sin payload ni datos de ubicación en la observación', async () => {
    const observed: RetryObservation[] = [];
    const sleeps: number[] = [];
    let calls = 0;
    await runWithRetry({
      method: 'GET',
      execute: async () => { calls += 1; if (calls === 1) throw new Error('429'); return 'ok'; },
      classify: () => 429,
      retryAfterMs: () => 800,
      observe: (event) => { observed.push(event); },
      sleep: async (ms) => { sleeps.push(ms); },
    });

    expect(sleeps).toEqual([800]);
    expect(observed).toEqual([{ attempt: 1, method: 'GET', status: 429, delayMs: 800 }]);
    expect(Object.keys(observed[0] ?? {}).sort()).toEqual(['attempt', 'delayMs', 'method', 'status']);
  });
});
