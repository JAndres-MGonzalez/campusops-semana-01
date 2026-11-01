/**
 * Servicio de ubicación (Semana 9): caché → proveedor → validación → manual.
 *
 * Es una lectura OPCIONAL con alternativa manual, por eso:
 * - nunca lanza: ante cualquier fallo devuelve la referencia escrita;
 * - no reintenta: repetir una lectura opcional multiplicaría solicitudes ante
 *   429/5xx sin proteger ningún efecto. La persona puede volver a buscar;
 * - no inventa coordenadas;
 * - sólo informa `origin`, `failure` y `durationMs` (nunca consulta, etiqueta,
 *   coordenadas ni actor).
 */

import type { IncidentLocation } from '../../campusops/contracts';
import { IncidentRequestError } from '../../domain/incident-request-error';
import type { LocationCache } from './cache';
import type { GeocodingLookup } from './provider';
import { selectIncidentLocationReal } from './select-location';

export type LocationFailure =
  | 'timeout' | 'rate_limit' | 'server' | 'network' | 'forbidden' | 'contract' | 'unknown';

export type LocationResolution = Readonly<{
  location: IncidentLocation;
  origin: 'provider' | 'cache' | 'manual';
  failure: LocationFailure | null;
}>;

export type LocationObservation = Readonly<{
  origin: LocationResolution['origin'];
  failure: LocationFailure | null;
  durationMs: number;
}>;

export type LocationService = Readonly<{
  resolve(query: string, manualLabel: string): Promise<LocationResolution>;
}>;

export type LocationServiceDeps = Readonly<{
  lookup: GeocodingLookup;
  cache?: LocationCache;
  now?: () => number;
  onObservation?: (observation: LocationObservation) => void;
}>;

function failureOf(error: unknown): LocationFailure {
  if (!(error instanceof IncidentRequestError)) return 'unknown';
  switch (error.kind) {
    case 'timeout':
    case 'rate_limit':
    case 'server':
    case 'network':
    case 'forbidden':
    case 'contract':
      return error.kind;
    default:
      return 'unknown';
  }
}

export function createLocationService(deps: LocationServiceDeps): LocationService {
  const now = deps.now ?? Date.now;

  return {
    async resolve(query, manualLabel) {
      const startedAt = now();
      const finish = (
        location: IncidentLocation,
        origin: LocationResolution['origin'],
        failure: LocationFailure | null,
      ): LocationResolution => {
        try {
          deps.onObservation?.({ origin, failure, durationMs: Math.max(0, now() - startedAt) });
        } catch {
          // Un observador defectuoso no debe romper la captura.
        }
        return { location, origin, failure };
      };
      const manual: IncidentLocation = { source: 'manual', label: manualLabel };

      try {
        const trimmed = query.trim();
        if (trimmed.length === 0) return finish(manual, 'manual', null);

        const cached = deps.cache?.get(trimmed);
        if (cached !== undefined) return finish(cached, 'cache', null);

        let payload: unknown;
        try {
          payload = await deps.lookup(trimmed);
        } catch (error) {
          return finish(manual, 'manual', failureOf(error));
        }

        const selected = selectIncidentLocationReal(payload, manualLabel);
        if (selected.source === 'provider') {
          deps.cache?.set(trimmed, selected);
          return finish(selected, 'provider', null);
        }
        // Respuesta inválida o incompleta: no se cachea y se conserva lo escrito.
        return finish(manual, 'manual', 'contract');
      } catch {
        return finish(manual, 'manual', 'unknown');
      }
    },
  };
}
