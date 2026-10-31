/**
 * Adaptador HTTP del servicio de ubicación (Semana 9).
 *
 * Hace una sola lectura `GET /v1/geocoding?q=...` con timeout por llamada y
 * devuelve el JSON tal cual (`unknown`): la validez de las coordenadas la decide
 * `selectIncidentLocationReal`, no este adaptador.
 *
 * No registra la URL, la consulta ni el cuerpo de la respuesta.
 */

import { IncidentRequestError } from '../../domain/incident-request-error';
import type { IncidentFailureKind } from '../../domain/incident-request-error';

export type GeocodingLookup = (query: string) => Promise<unknown>;

export type GeocodingProviderOptions = Readonly<{
  baseUrl: string;
  /** Por defecto 2000 ms. */
  timeoutMs?: number;
  /** Si devuelve `null` no hay sesión: se bloquea antes de tocar la red. */
  tokenProvider?: () => Promise<string | null>;
  actorProvider?: () => string | null;
  fetchImpl?: typeof fetch;
  scenario?: string;
}>;

const DEFAULT_TIMEOUT_MS = 2000;

/** Mismo criterio que el repositorio HTTP de incidencias. */
function kindOfStatus(status: number): IncidentFailureKind {
  if (status === 429) return 'rate_limit';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 400 || status === 422) return 'validation';
  return 'server';
}

function retryAfterSecondsOf(response: Response): number | undefined {
  const header = response.headers.get('retry-after');
  if (header === null || !/^\d+$/.test(header)) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export function createHttpGeocodingProvider(options: GeocodingProviderOptions): GeocodingLookup {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return async (query: string): Promise<unknown> => {
    // Un controlador y un temporizador por llamada: un timeout no arrastra a la siguiente.
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const aborted = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new IncidentRequestError('timeout'));
      }, timeoutMs);
    });

    const run = async (): Promise<unknown> => {
      const token = options.tokenProvider === undefined
        ? 'course-valid-token'
        : await options.tokenProvider();
      // Sin sesión no se toca la red.
      if (token === null) throw new IncidentRequestError('forbidden');

      const actor = options.actorProvider?.() ?? 'reporter-1';
      const url = `${options.baseUrl}/v1/geocoding?q=${encodeURIComponent(query.trim())}`;
      const response = await (options.fetchImpl ?? fetch)(url, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Course-Actor': actor,
          ...(options.scenario !== undefined ? { 'X-Course-Scenario': options.scenario } : {}),
        },
      });
      if (!response.ok) {
        throw new IncidentRequestError(
          kindOfStatus(response.status),
          response.status,
          retryAfterSecondsOf(response),
        );
      }
      try {
        return (await response.json()) as unknown;
      } catch {
        throw new IncidentRequestError('contract');
      }
    };

    try {
      return await Promise.race([run(), aborted]);
    } catch (error) {
      if (error instanceof IncidentRequestError) throw error;
      if (controller.signal.aborted) throw new IncidentRequestError('timeout');
      throw new IncidentRequestError('network');
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}
