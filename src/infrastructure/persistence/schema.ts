/**
 * Esquema versionado de persistencia (Semana 8).
 *
 * La versión del esquema permite migrar datos antiguos sin perder
 * incidencias ni operaciones pendientes.
 */
export const SCHEMA_VERSION = 1 as const;

export type SchemaVersion = typeof SCHEMA_VERSION;

export const STORAGE_KEYS = {
  SCHEMA_VERSION: 'campusops.schema.version',
  INCIDENTS: 'campusops.data.incidents',
  PENDING_QUEUE: 'campusops.queue.pending',
  MIGRATION_SNAPSHOT: 'campusops.migration.snapshot',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
