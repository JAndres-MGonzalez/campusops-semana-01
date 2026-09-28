const SENSITIVE_KEYS = new Set([
  'authorization',
  'error',
  'password',
  'token',
  'accesstoken',
  'refreshtoken',
  'email',
  'displayname',
  'name',
  'userid',
  'reporterid',
  'technicianid',
  'assignedtechnicianid',
  'location',
  'latitude',
  'longitude',
  'photos',
  'evidence',
  'internalcomments',
  'assignmenthistory',
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, '');
}

/**
 * Sanitización de telemetría (Semana 4).
 * Recorre objetos y listas SIN mutar la entrada: reemplaza por `[REDACTED]`
 * el valor completo de las claves sensibles (normalizadas a minúsculas y sin
 * `_` ni `-`) y conserva los campos técnicos no sensibles y el resto del texto.
 */
export function redactTelemetryData(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => redactTelemetryData(item));
  if (input !== null && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) =>
        SENSITIVE_KEYS.has(normalizeKey(key))
          ? [key, '[REDACTED]']
          : [key, redactTelemetryData(value)],
      ),
    );
  }
  return input;
}

export function reportIncidentFailure(operation: 'list' | 'detail', error: unknown): void {
  const record = redactTelemetryData({ event: 'incident_load_failed', operation, error });
  console.warn(JSON.stringify(record));
}
