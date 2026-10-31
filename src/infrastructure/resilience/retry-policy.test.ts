import { RETRY_LIMITS, backoffDelayMs, planRetryReal, retryAfterDelayMs } from './retry-policy';

describe('planRetry', () => {
  it('no reintenta a partir del intento 4', () => {
    expect(planRetryReal({ method: 'GET', status: 503, attempt: 4 }).retry).toBe(false);
    expect(planRetryReal({ method: 'GET', status: 'timeout', attempt: 4 }).retry).toBe(false);
    expect(planRetryReal({ method: 'GET', status: 503, attempt: 5 }).retry).toBe(false);
  });

  it('reintenta fallos transitorios con espera progresiva y acotada', () => {
    expect(planRetryReal({ method: 'GET', status: 503, attempt: 1 }).delayMs).toBe(500);
    expect(planRetryReal({ method: 'GET', status: 503, attempt: 2 }).delayMs).toBe(1_000);
    expect(planRetryReal({ method: 'GET', status: 503, attempt: 3 }).delayMs).toBe(2_000);
    expect(backoffDelayMs(10)).toBe(RETRY_LIMITS.maxDelayMs);
  });

  it('respeta un Retry-After válido una sola vez', () => {
    expect(planRetryReal({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 800 })).toEqual({
      retry: true,
      delayMs: 800,
      requiresStableIdempotencyKey: false,
    });
    // El límite publicado manda sobre el encabezado del servidor.
    expect(planRetryReal({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 120_000 }).delayMs)
      .toBe(RETRY_LIMITS.maxRetryAfterMs);
    expect(planRetryReal({ method: 'GET', status: 429, attempt: 1, retryAfterMs: 2_000 }).delayMs).toBe(2_000);
  });

  it('ignora un Retry-After inválido y usa el backoff finito', () => {
    for (const retryAfterMs of [Number.NaN, Number.POSITIVE_INFINITY, -10]) {
      const plan = planRetryReal({ method: 'GET', status: 429, attempt: 2, retryAfterMs });
      expect(plan.retry).toBe(true);
      expect(Number.isFinite(plan.delayMs)).toBe(true);
      expect(plan.delayMs).toBe(backoffDelayMs(2));
    }
    expect(retryAfterDelayMs('5')).toBeNull();
    expect(retryAfterDelayMs(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('no repite un POST sin identidad estable', () => {
    expect(planRetryReal({ method: 'POST', status: 503, attempt: 1 })).toEqual({
      retry: false,
      delayMs: 0,
      requiresStableIdempotencyKey: true,
    });
    expect(planRetryReal({ method: 'POST', status: 503, attempt: 1, idempotencyKey: 'corta' }))
      .toMatchObject({ retry: false, requiresStableIdempotencyKey: true });
    expect(planRetryReal({ method: 'POST', status: 'timeout', attempt: 1, idempotencyKey: 'op-0001-abc' }))
      .toMatchObject({ retry: true, requiresStableIdempotencyKey: false });
  });

  it('no reintenta respuestas de contrato ni estados no transitorios', () => {
    for (const status of [200, 201, 400, 401, 404, 409, 422]) {
      expect(planRetryReal({ method: 'GET', status, attempt: 1 })).toEqual({
        retry: false,
        delayMs: 0,
        requiresStableIdempotencyKey: false,
      });
    }
  });

  it('devuelve siempre una demora finita y no negativa', () => {
    for (let attempt = 0; attempt <= 6; attempt += 1) {
      const plan = planRetryReal({ method: 'GET', status: 'timeout', attempt });
      expect(Number.isFinite(plan.delayMs)).toBe(true);
      expect(plan.delayMs).toBeGreaterThanOrEqual(0);
    }
  });
});
