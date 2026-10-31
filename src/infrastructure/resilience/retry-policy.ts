/**
 * Política de reintentos de la Semana 9.
 *
 * Reglas publicadas en `docs/CAMPUSOPS_API.md` y `docs/assignments/week-09.md`:
 * 1. los intentos son acotados: desde el intento 4 ya no se reintenta,
 * 2. un `Retry-After` válido se respeta, pero la espera siempre es finita,
 * 3. las esperas crecen de forma progresiva (backoff) hasta un tope,
 * 4. un `POST` sólo se repite con identidad estable de operación.
 *
 * La función es pura: no duerme, no hace red y no registra nada. Quien la usa
 * (`retry-executor`) decide cómo esperar y qué observa.
 */

export type RetryMethod = 'GET' | 'POST';

/** Estado observable del intento: código HTTP o corte por timeout local. */
export type RetryStatus = number | 'timeout';

export type RetryInput = Readonly<{
  method: RetryMethod;
  status: RetryStatus;
  attempt: number;
  retryAfterMs?: number;
  idempotencyKey?: string;
}>;

export type RetryPlan = Readonly<{
  retry: boolean;
  delayMs: number;
  requiresStableIdempotencyKey: boolean;
}>;

/**
 * Límites configurables y comprobables. `firstNonRetryableAttempt` es el primer
 * intento que ya no se repite: con 3 previos, la operación se hizo 3 veces.
 */
export const RETRY_LIMITS = {
  firstNonRetryableAttempt: 4,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  maxRetryAfterMs: 30_000,
  /** Longitud mínima de la clave de operación, igual que el backend. */
  minIdempotencyKeyLength: 8,
} as const;

/** Fallos transitorios: vale la pena repetir si la operación es segura. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

const NO_RETRY: RetryPlan = { retry: false, delayMs: 0, requiresStableIdempotencyKey: false };

function isRetryableStatus(status: RetryStatus): boolean {
  return status === 'timeout' || (typeof status === 'number' && RETRYABLE_STATUSES.has(status));
}

/** Una clave sirve como identidad estable sólo si existe y tiene longitud útil. */
export function hasStableIdempotencyKey(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length >= RETRY_LIMITS.minIdempotencyKeyLength;
}

/** Backoff exponencial acotado: 500, 1000, 2000… nunca más de `maxDelayMs`. */
export function backoffDelayMs(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) && attempt >= 1 ? Math.floor(attempt) : 1;
  const exponential = RETRY_LIMITS.baseDelayMs * 2 ** (safeAttempt - 1);
  return Math.min(exponential, RETRY_LIMITS.maxDelayMs);
}

/**
 * `Retry-After` sólo se respeta si es un número finito y no negativo. Nunca se
 * acepta un valor que deje la espera abierta: se acota a `maxRetryAfterMs`.
 */
export function retryAfterDelayMs(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.round(value), RETRY_LIMITS.maxRetryAfterMs);
}

/**
 * Decide si el intento `attempt` (base 1) debe repetirse y cuánto esperar.
 * Nunca lanza: una entrada incompleta termina en "no reintentar".
 */
export function planRetryReal(input: RetryInput): RetryPlan {
  const attempt = Number.isFinite(input.attempt) && input.attempt >= 1 ? Math.floor(input.attempt) : 1;

  // POST sin clave estable: repetir podría duplicar el efecto en el servidor.
  if (input.method === 'POST' && !hasStableIdempotencyKey(input.idempotencyKey)) {
    return { retry: false, delayMs: 0, requiresStableIdempotencyKey: true };
  }

  if (!isRetryableStatus(input.status)) return NO_RETRY;

  // Límite publicado: desde el intento 4 la operación ya no se repite.
  if (attempt >= RETRY_LIMITS.firstNonRetryableAttempt) return NO_RETRY;

  const honored = retryAfterDelayMs(input.retryAfterMs);
  return {
    retry: true,
    delayMs: honored === null ? backoffDelayMs(attempt) : honored,
    requiresStableIdempotencyKey: false,
  };
}
