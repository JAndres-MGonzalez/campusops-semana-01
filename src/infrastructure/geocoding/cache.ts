/**
 * Caché en memoria de ubicaciones válidas del proveedor (Semana 9).
 *
 * Vive sólo durante la sesión de captura: evita repetir consultas idénticas y
 * no persiste entre arranques, así que no retiene ubicaciones sin necesidad.
 * Qué se guarda lo decide el servicio; la caché sólo guarda lo que recibe.
 */

import type { IncidentLocation } from '../../campusops/contracts';

export type LocationCache = Readonly<{
  get(query: string): IncidentLocation | undefined;
  set(query: string, value: IncidentLocation): void;
  clear(): void;
  size(): number;
}>;

export type LocationCacheOptions = Readonly<{
  /** Por defecto 5 minutos. */
  ttlMs?: number;
  /** Por defecto 32 entradas. */
  maxEntries?: number;
  now?: () => number;
}>;

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 32;

/** Clave normalizada: sin espacios sobrantes, espacios internos colapsados y minúsculas. */
export function normalizeLocationQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function createLocationCache(options: LocationCacheOptions = {}): LocationCache {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
  const maxEntries = Math.max(1, options.maxEntries ?? DEFAULT_MAX_ENTRIES);
  const now = options.now ?? Date.now;
  // `Map` conserva el orden de inserción: la primera clave es la más antigua (FIFO).
  const entries = new Map<string, Readonly<{ value: IncidentLocation; expiresAt: number }>>();

  return {
    get(query) {
      const key = normalizeLocationQuery(query);
      const entry = entries.get(key);
      if (entry === undefined) return undefined;
      if (now() >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(query, value) {
      const key = normalizeLocationQuery(query);
      if (!entries.has(key) && entries.size >= maxEntries) {
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
      // Copia congelada: ningún llamador comparte un objeto mutable con la caché.
      entries.set(key, { value: Object.freeze({ ...value }), expiresAt: now() + ttlMs });
    },
    clear() {
      entries.clear();
    },
    size() {
      return entries.size;
    },
  };
}
