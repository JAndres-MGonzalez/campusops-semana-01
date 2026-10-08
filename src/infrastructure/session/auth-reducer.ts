/**
 * Reducer puro de eventos de autenticación (semana 6).
 *
 * Es la **lógica real** que comparte `src/course-evaluation/index.ts` a través
 * de `coordinateRefresh`. No importa `course-evaluation` (respeta los límites de
 * arquitectura): `AuthSignal` replica la forma de `AuthEvent` estructuralmente.
 */

export type AuthSignal = Readonly<{
  type: 'request401' | 'refreshSucceeded' | 'refreshFailed' | 'logout';
  requestId?: string;
  generation?: number;
  token?: string;
}>;

export type AuthSummary = Readonly<{
  status: 'anonymous' | 'authenticated';
  activeGeneration: number;
  refreshCalls: number;
  retriedRequestIds: readonly string[];
  persistedToken: string | null;
}>;

/**
 * Política de renovación single-flight y reintentos limitados:
 *
 * - Un `request401` siempre se registra como reintento (una vez).
 * - Solo se abre una renovación si no hay una en curso **y** la sesión no está
 *   ya autenticada. Por eso los 401 concurrentes se coalescen (la primera
 *   renovación deja `refreshInFlight = true`) y un 401 con generación obsoleta
 *   posterior a un refresh exitoso no reabre la renovación (evita el bucle).
 * - Si la renovación falla, la sesión vuelve de forma segura a `anonymous` y
 *   olvida el token persistido.
 */
export function reduceAuthSignals(signals: readonly AuthSignal[]): AuthSummary {
  let status: 'anonymous' | 'authenticated' = 'anonymous';
  let activeGeneration = 0;
  let persistedToken: string | null = null;
  let refreshCalls = 0;
  let refreshInFlight = false;
  const retriedRequestIds: string[] = [];

  for (const event of signals) {
    if (event.type === 'request401') {
      if (event.requestId !== undefined) {
        retriedRequestIds.push(event.requestId);
      }
      if (!refreshInFlight && status !== 'authenticated') {
        refreshInFlight = true;
        refreshCalls += 1;
      }
      continue;
    }

    if (event.type === 'refreshSucceeded') {
      refreshInFlight = false;
      status = 'authenticated';
      activeGeneration = event.generation ?? activeGeneration;
      persistedToken = event.token ?? null;
      continue;
    }

    if (event.type === 'refreshFailed') {
      refreshInFlight = false;
      status = 'anonymous';
      persistedToken = null;
      continue;
    }

    // logout
    refreshInFlight = false;
    status = 'anonymous';
    activeGeneration = 0;
    persistedToken = null;
  }

  return {
    status,
    activeGeneration,
    refreshCalls,
    retriedRequestIds,
    persistedToken,
  };
}