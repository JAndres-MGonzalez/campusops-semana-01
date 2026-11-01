import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { IncidentRequestError } from '../../src/domain/incident-request-error';
import { HttpIncidentRepository } from '../../src/infrastructure/incidents/http-incident-repository';
import { runWithRetry } from '../../src/infrastructure/resilience/retry-executor';
import { planRetryReal } from '../../src/infrastructure/resilience/retry-policy';

const observations: Record<string, unknown>[] = [];
const draft = { category: 'connectivity' as const, description: 'Falla ficticia', location: 'Zona ficticia A' };
const incident = {
  id: 'campus-inc-001', version: 2, status: 'open',
  payload: { ...draft, reporterId: 'reporter-1' },
};

function response(status: number, body: unknown = {}, retryAfter?: string): Response {
  return {
    ok: status >= 200 && status < 300, status,
    headers: { get: (name: string) => name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null },
    json: async () => body,
  } as unknown as Response;
}

function controlledClock() {
  let now = 0;
  const delays: number[] = [];
  return {
    now: () => now, delays,
    sleep: async (ms: number) => { delays.push(ms); now += ms; },
  };
}

afterAll(() => {
  const path = process.env.CAMPUSOPS_RETRY_OBSERVATIONS;
  if (path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ generatedAt: new Date().toISOString(), clock: 'controlled', observations }, null, 2) + '\n');
  }
});

describe('métricas independientes de reintento', () => {
  it('respeta Retry-After y conserva clave y cuerpo después de un 429', async () => {
    const clock = controlledClock();
    const requests: RequestInit[] = [];
    const starts: number[] = [];
    const repository = new HttpIncidentRepository('http://fixture.invalid', {
      sleepImpl: clock.sleep,
      fetchImpl: async (_url, init) => {
        requests.push(init ?? {}); starts.push(clock.now());
        return requests.length === 1 ? response(429, {}, '1') : response(201, { incident });
      },
    });
    await expect(repository.create(draft, 'andres-retry-429-001')).resolves.toMatchObject({ id: incident.id });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.headers).toEqual(requests[0]?.headers);
    expect(requests[1]?.body).toBe(requests[0]?.body);
    expect(clock.delays).toEqual([1000]);
    expect(starts).toEqual([0, 1000]);
    observations.push({ id: 'retry-after-honored', requests: requests.length, startsMs: starts, delaysMs: clock.delays, stableKey: true, stableBody: true });
  });

  it('termina con cuatro solicitudes ante un 503 persistente', async () => {
    const clock = controlledClock();
    let requests = 0;
    const starts: number[] = [];
    const repository = new HttpIncidentRepository('http://fixture.invalid', {
      sleepImpl: clock.sleep,
      fetchImpl: async () => { requests += 1; starts.push(clock.now()); return response(503); },
    });
    await expect(repository.create(draft, 'andres-retry-503-001')).rejects.toMatchObject({ kind: 'server', httpStatus: 503 });
    expect(requests).toBe(4);
    expect(clock.delays).toEqual([500, 1000, 2000]);
    expect(starts).toEqual([0, 500, 1500, 3500]);
    observations.push({ id: 'bounded-503', requests, startsMs: starts, delaysMs: clock.delays });
  });

  it('recorta Retry-After de 120 segundos a una espera finita de 30 segundos', async () => {
    const clock = controlledClock();
    let requests = 0;
    const repository = new HttpIncidentRepository('http://fixture.invalid', {
      sleepImpl: clock.sleep,
      fetchImpl: async () => { requests += 1; return requests === 1 ? response(429, {}, '120') : response(201, { incident }); },
    });
    await repository.create(draft, 'andres-retry-cap-001');
    expect(requests).toBe(2);
    expect(clock.delays).toEqual([30000]);
    expect(clock.delays.every(Number.isFinite)).toBe(true);
    observations.push({ id: 'retry-after-capped', requests, delaysMs: clock.delays });
  });

  it('ejecuta una sola solicitud POST cuando falta identidad estable', async () => {
    let requests = 0;
    const clock = controlledClock();
    const outcome = await runWithRetry({
      method: 'POST',
      execute: async () => { requests += 1; throw new IncidentRequestError('timeout'); },
      classify: () => 'timeout', sleep: clock.sleep,
    });
    expect(planRetryReal({ method: 'POST', status: 'timeout', attempt: 1 })).toMatchObject({ retry: false, requiresStableIdempotencyKey: true });
    expect(outcome).toMatchObject({ ok: false, attempts: 1 });
    expect(requests).toBe(1);
    expect(clock.delays).toEqual([]);
    observations.push({ id: 'post-without-key', requests, delaysMs: clock.delays, requiresStableIdempotencyKey: true });
  });

  it('conserva el conflicto 409 sin repetir la operación', async () => {
    const clock = controlledClock();
    let requests = 0;
    const repository = new HttpIncidentRepository('http://fixture.invalid', {
      sleepImpl: clock.sleep,
      fetchImpl: async () => { requests += 1; return response(409); },
    });
    await expect(repository.start('campus-inc-001', 1, 'andres-conflict-001')).rejects.toMatchObject({ kind: 'conflict' });
    expect(requests).toBe(1);
    expect(clock.delays).toEqual([]);
    observations.push({ id: 'conflict-not-retried', requests, delaysMs: clock.delays });
  });

  it('recupera una respuesta perdida con la misma identidad y un solo efecto', async () => {
    const clock = controlledClock();
    const received: string[] = [];
    const history = new Set<string>();
    const key = 'andres-lost-response-001';
    const body = JSON.stringify({ action: 'resolve', baseVersion: 2, diagnosis: 'Revisión ficticia' });
    const outcome = await runWithRetry({
      method: 'POST', idempotencyKey: key, sleep: clock.sleep,
      classify: () => 'timeout',
      execute: async () => {
        received.push(body);
        const duplicate = history.has(key);
        if (!duplicate) history.add(key);
        if (received.length === 1) throw new IncidentRequestError('timeout');
        return { duplicate };
      },
    });
    expect(outcome).toMatchObject({ ok: true, value: { duplicate: true }, attempts: 2 });
    expect(new Set(received).size).toBe(1);
    expect(history.size).toBe(1);
    expect(clock.delays).toEqual([500]);
    observations.push({ id: 'lost-response-controlled', requests: received.length, delaysMs: clock.delays, historyEvents: history.size, duplicate: true, stableKey: true, stableBody: true });
  });
});
