/**
 * Selección de la ubicación de una incidencia (Semana 9).
 *
 * El proveedor de geocodificación es opcional: si responde con datos usables se
 * conserva su etiqueta y sus coordenadas; si falla (timeout, 429, error del
 * servidor, datos incompletos o fuera de rango) la app sigue funcionando con la
 * referencia escrita por la persona y **no inventa coordenadas**.
 *
 * Es una función pura: no hace red, no lee el reloj y no registra la consulta,
 * la etiqueta ni las coordenadas.
 */

import type { IncidentLocation } from '../../campusops/contracts';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const inRange = (value: unknown, min: number, max: number): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;

/** `(0, 0)` es una coordenada válida (Golfo de Guinea), no un valor ausente. */
const isValidLatitude = (value: unknown): value is number => inRange(value, -90, 90);
const isValidLongitude = (value: unknown): value is number => inRange(value, -180, 180);

/** Respuesta de error del doble de proveedor: `{ status: 429 }`, `{ status: 500 }`… */
function isErrorPayload(record: Record<string, unknown>): boolean {
  const status = record.status;
  return typeof status === 'number' && (status < 200 || status >= 300);
}

export function selectIncidentLocationReal(provider: unknown, manualLabel: string): IncidentLocation {
  const manual: IncidentLocation = { source: 'manual', label: manualLabel };

  if (!isRecord(provider)) return manual;
  if (isErrorPayload(provider)) return manual;

  const { label, latitude, longitude } = provider;
  if (typeof label !== 'string' || label.trim().length === 0) return manual;
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return manual;

  return { source: 'provider', label, latitude, longitude };
}
