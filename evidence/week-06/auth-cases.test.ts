// Casos documentados por Ismael en evidence/week-06/reports/3523110741.md.
import { coordinateRefresh, redactForTelemetry } from '../../src/course-evaluation';
import { createSessionManager } from '../../src/infrastructure/session/manager';
import { createMemorySessionStorage } from '../../src/infrastructure/session/memory-storage';

describe('week-06 session manual', () => {
  test('nominal: 401 concurrentes comparten una sola renovacion', () => {
    const summary = coordinateRefresh([
      { type: 'request401', requestId: 'a', generation: 0 },
      { type: 'request401', requestId: 'b', generation: 0 },
      { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
    ]);
    expect(summary).toEqual({
      status: 'authenticated',
      activeGeneration: 1,
      refreshCalls: 1,
      retriedRequestIds: ['a', 'b'],
      persistedToken: 'course-token-1',
    });
  });

  test('boundary: una segunda generacion de 401 no dispara otra renovacion', () => {
    const summary = coordinateRefresh([
      { type: 'request401', requestId: 'a', generation: 0 },
      { type: 'refreshSucceeded', generation: 1, token: 't1' },
      { type: 'request401', requestId: 'b', generation: 1 },
    ]);
    expect(summary.refreshCalls).toBe(1);
    expect(summary.retriedRequestIds).toEqual(['a', 'b']);
  });

  test('failure: refreshFailed vuelve a no autenticado y olvida el token', () => {
    const summary = coordinateRefresh([
      { type: 'request401', requestId: 'a', generation: 0 },
      { type: 'refreshFailed', generation: 0 },
    ]);
    expect(summary.status).toBe('anonymous');
    expect(summary.persistedToken).toBeNull();
    expect(summary.refreshCalls).toBe(1);
  });

  test('failure: logout borra el estado persistido', () => {
    const summary = coordinateRefresh([{ type: 'logout' }]);
    expect(summary.persistedToken).toBeNull();
    expect(summary.status).toBe('anonymous');
  });

  test('boundary: expiracion con reloj controlable', async () => {
    let clock = 1_000;
    const storage = createMemorySessionStorage();
    const manager = createSessionManager({
      storage,
      now: () => clock,
      baseUrl: 'http://127.0.0.1:4310',
      fetchImpl: async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/v1/session/refresh')) {
          return new Response('{}', { status: 401 });
        }
        return new Response(
          JSON.stringify({ token: 't1', generation: 1, expiresInMs: 60_000 }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });
    await manager.login('technician-1');
    clock += 120_000; // el token ya expiro, sin sleep real
    expect(await manager.getValidToken()).toBeNull();
  });

  test('boundary: los tokens no quedan en claro para telemetria', () => {
    const redacted = redactForTelemetry({ token: 'course-valid-token', authorization: 'Bearer x' });
    expect(JSON.stringify(redacted)).not.toContain('course-valid-token');
    expect(JSON.stringify(redacted)).toContain('[REDACTED]');
  });
});
describe('week-06 session manual extra', () => {
  test('failure: logout tras una renovacion exitosa borra el token persistido', () => {
    const summary = coordinateRefresh([
      { type: 'request401', requestId: 'a', generation: 0 },
      { type: 'refreshSucceeded', generation: 1, token: 't1' },
      { type: 'logout' },
    ]);
    expect(summary.persistedToken).toBeNull();
    expect(summary.status).toBe('anonymous');
  });
});
