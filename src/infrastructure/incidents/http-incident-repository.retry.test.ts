import type { IncidentDraft } from '../../domain/incident';
import { HttpIncidentRepository } from './http-incident-repository';

const dto = {
  id: 'campus-inc-001',
  version: 1,
  status: 'open',
  payload: {
    category: 'connectivity',
    description: 'Falla ficticia de conectividad',
    location: 'Laboratorio de prueba',
    reporterId: 'reporter-1',
  },
};

const draft: IncidentDraft = {
  category: 'connectivity',
  description: 'Falla ficticia de conectividad',
  location: 'Laboratorio de prueba',
};

function response(body: unknown, status = 200, retryAfter?: string): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => (name.toLowerCase() === 'retry-after' ? retryAfter ?? null : null) },
    json: async () => body,
  } as unknown as Response;
}

const repository = (fetchImpl: typeof fetch, sleep: number[]): HttpIncidentRepository =>
  new HttpIncidentRepository('http://127.0.0.1:4310', {
    fetchImpl,
    sleepImpl: async (ms) => { sleep.push(ms); },
  });

describe('reintentos del repositorio HTTP', () => {
  it('repite un 429 con la misma clave y respeta Retry-After', async () => {
    const calls: RequestInit[] = [];
    const sleeps: number[] = [];
    const repo = repository(async (_input, init) => {
      calls.push(init ?? {});
      return calls.length === 1 ? response({ error: 'rate_limited' }, 429, '1') : response({ incident: dto }, 201);
    }, sleeps);

    const detail = await repo.create(draft, 'create-op-0001');

    expect(detail?.id).toBe('campus-inc-001');
    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers).toMatchObject({ 'Idempotency-Key': 'create-op-0001' });
    expect(calls[1]?.headers).toMatchObject({ 'Idempotency-Key': 'create-op-0001' });
    expect(calls[1]?.body).toBe(calls[0]?.body);
    expect(sleeps).toEqual([1_000]);
  });

  it('repite 5xx con espera progresiva y no cambia el cuerpo', async () => {
    const calls: RequestInit[] = [];
    const sleeps: number[] = [];
    const repo = repository(async (_input, init) => {
      calls.push(init ?? {});
      return calls.length < 3 ? response({ error: 'server_error' }, 503) : response({ incident: dto }, 201);
    }, sleeps);

    await repo.create(draft, 'create-op-0002');

    expect(calls).toHaveLength(3);
    expect(sleeps).toEqual([500, 1_000]);
    expect(new Set(calls.map((call) => call.body)).size).toBe(1);
  });

  it('no reintenta una validación del servidor', async () => {
    const sleeps: number[] = [];
    const send = jest.fn(async () => response({ error: 'invalid' }, 400));
    const repo = repository(send as unknown as typeof fetch, sleeps);

    await expect(repo.create(draft, 'create-op-0003')).rejects.toMatchObject({ kind: 'validation' });
    expect(send).toHaveBeenCalledTimes(1);
    expect(sleeps).toEqual([]);
  });

  it('repite un timeout con la misma identidad de operación', async () => {
    const sleeps: number[] = [];
    let calls = 0;
    const repo = new HttpIncidentRepository('http://127.0.0.1:4310', {
      timeoutMs: 10,
      sleepImpl: async (ms) => { sleeps.push(ms); },
      fetchImpl: (_input, init) => {
        calls += 1;
        if (calls === 1) {
          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          });
        }
        return Promise.resolve(response({ incident: dto }, 201));
      },
    });

    const detail = await repo.create(draft, 'create-op-0004');

    expect(detail?.id).toBe('campus-inc-001');
    expect(calls).toBe(2);
    expect(sleeps).toEqual([500]);
  });

  it('no reintenta cuando el servidor rechaza la operación por conflicto', async () => {
    const sleeps: number[] = [];
    const send = jest.fn(async () => response({ error: 'conflict' }, 409));
    const repo = repository(send as unknown as typeof fetch, sleeps);

    await expect(repo.start('campus-inc-001', 1, 'start-op-0005')).rejects.toMatchObject({ kind: 'conflict' });
    expect(send).toHaveBeenCalledTimes(1);
  });
});
