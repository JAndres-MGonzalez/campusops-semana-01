/**
 * Ejecutor de reintentos (Semana 9).
 *
 * Aplica `planRetryReal` a una operación real: reintenta sólo lo que la política
 * permite, espera la demora calculada y deja una observación **sanitizada** de
 * cada reintento (intento, método, estado y demora) sin payload, sin claves de
 * sesión y sin datos de ubicación.
 *
 * La espera es inyectable para poder probar los límites sin dormir de verdad.
 */

import { RETRY_LIMITS, planRetryReal } from './retry-policy';
import type { RetryMethod, RetryStatus } from './retry-policy';

export type RetryObservation = Readonly<{
  attempt: number;
  method: RetryMethod;
  status: RetryStatus;
  delayMs: number;
}>;

export type RetryOutcome<T> =
  | Readonly<{ ok: true; value: T; attempts: number; delaysMs: readonly number[] }>
  | Readonly<{ ok: false; error: unknown; attempts: number; delaysMs: readonly number[] }>;

export type RetryRunOptions<T> = Readonly<{
  method: RetryMethod;
  /** Ejecuta el intento. Recibe el número de intento (base 1). */
  execute: (attempt: number) => Promise<T>;
  /** Traduce el error a un estado observable; `null` significa "no reintentar". */
  classify: (error: unknown) => RetryStatus | null;
  idempotencyKey?: string;
  retryAfterMs?: (error: unknown) => number | undefined;
  sleep?: (ms: number) => Promise<void>;
  observe?: (event: RetryObservation) => void;
  maxAttempts?: number;
}>;

const defaultSleep = (ms: number): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

export async function runWithRetry<T>(options: RetryRunOptions<T>): Promise<RetryOutcome<T>> {
  const sleep = options.sleep ?? defaultSleep;
  const limit = Math.min(options.maxAttempts ?? RETRY_LIMITS.firstNonRetryableAttempt, 10);
  const delaysMs: number[] = [];

  for (let attempt = 1; ; attempt += 1) {
    try {
      const value = await options.execute(attempt);
      return { ok: true, value, attempts: attempt, delaysMs };
    } catch (error) {
      const status = options.classify(error);
      if (status === null) {
        return { ok: false, error, attempts: attempt, delaysMs };
      }
      const retryAfterMs = options.retryAfterMs?.(error);
      const plan = planRetryReal({
        method: options.method,
        status,
        attempt,
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
        ...(options.idempotencyKey !== undefined ? { idempotencyKey: options.idempotencyKey } : {}),
      });
      if (!plan.retry || attempt >= limit) {
        return { ok: false, error, attempts: attempt, delaysMs };
      }
      delaysMs.push(plan.delayMs);
      options.observe?.({ attempt, method: options.method, status, delayMs: plan.delayMs });
      await sleep(plan.delayMs);
    }
  }
}
