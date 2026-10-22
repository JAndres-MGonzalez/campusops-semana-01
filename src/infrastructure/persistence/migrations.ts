/**
 * Migraciones con rollback/recuperación controlada (Semana 8).
 * Debe poder migrar datos de esquema anterior al nuevo sin dejar datos a medias.
 */

import { storage } from './storage';
import { STORAGE_KEYS, SCHEMA_VERSION } from './schema';

export interface MigrationSnapshot {
  readonly schemaVersion: number;
  readonly incidents: unknown;
  readonly queue: unknown;
  readonly timestamp: number;
}

export interface MigrationResult {
  readonly success: boolean;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly rolledBack: boolean;
  readonly message: string;
}

export interface MigrationOptions {
  injectFailure?: boolean;
}

async function createSnapshot(): Promise<MigrationSnapshot> {
  const incidentsRaw = await storage.getItem(STORAGE_KEYS.INCIDENTS);
  const queueRaw = await storage.getItem(STORAGE_KEYS.PENDING_QUEUE);
  const currentVersionRaw = await storage.getItem(STORAGE_KEYS.SCHEMA_VERSION);

  return {
    schemaVersion: currentVersionRaw ? Number(currentVersionRaw) : 0,
    incidents: incidentsRaw ? JSON.parse(incidentsRaw) : null,
    queue: queueRaw ? JSON.parse(queueRaw) : null,
    timestamp: Date.now(),
  };
}

async function saveSnapshot(snapshot: MigrationSnapshot): Promise<void> {
  await storage.setItem(STORAGE_KEYS.MIGRATION_SNAPSHOT, JSON.stringify(snapshot));
}

async function restoreFromSnapshot(snapshot: MigrationSnapshot): Promise<void> {
  if (snapshot.incidents !== null && snapshot.incidents !== undefined) {
    await storage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify(snapshot.incidents));
  } else {
    await storage.removeItem(STORAGE_KEYS.INCIDENTS);
  }

  if (snapshot.queue !== null && snapshot.queue !== undefined) {
    await storage.setItem(STORAGE_KEYS.PENDING_QUEUE, JSON.stringify(snapshot.queue));
  } else {
    await storage.removeItem(STORAGE_KEYS.PENDING_QUEUE);
  }

  await storage.setItem(STORAGE_KEYS.SCHEMA_VERSION, String(snapshot.schemaVersion));
}

async function applyMigration(fromVersion: number, toVersion: number, injectFailure: boolean): Promise<void> {
  // Simular migración paso a paso
  if (fromVersion === 0 && toVersion >= 1) {
    // Migración inicial - asegurar estructuras existen
    const incidentsRaw = await storage.getItem(STORAGE_KEYS.INCIDENTS);
    if (!incidentsRaw) {
      await storage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify([]));
    }
    const queueRaw = await storage.getItem(STORAGE_KEYS.PENDING_QUEUE);
    if (!queueRaw) {
      await storage.setItem(STORAGE_KEYS.PENDING_QUEUE, JSON.stringify([]));
    }
  }

  // Si se inyecta falla a mitad de migración
  if (injectFailure) {
    throw new Error('Simulated migration failure - injected for testing');
  }

  // Migración exitosa
  await storage.setItem(STORAGE_KEYS.SCHEMA_VERSION, String(toVersion));
}

export async function migrate(options: MigrationOptions = {}): Promise<MigrationResult> {
  const currentVersionRaw = await storage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
  const fromVersion = currentVersionRaw ? Number(currentVersionRaw) : 0;
  const toVersion = SCHEMA_VERSION;

  if (fromVersion === toVersion) {
    return {
      success: true,
      fromVersion,
      toVersion,
      rolledBack: false,
      message: 'Schema already at current version',
    };
  }

  // Crear snapshot antes de migrar
  const snapshot = await createSnapshot();
  await saveSnapshot(snapshot);

  try {
    await applyMigration(fromVersion, toVersion, options.injectFailure ?? false);
    return {
      success: true,
      fromVersion,
      toVersion,
      rolledBack: false,
      message: 'Migration completed successfully',
    };
  } catch (error) {
    // Rollback / recuperación controlada
    try {
      await restoreFromSnapshot(snapshot);
      return {
        success: false,
        fromVersion,
        toVersion,
        rolledBack: true,
        message: `Migration failed, rolled back to state before migration: ${error instanceof Error ? error.message : 'unknown'}`,
      };
    } catch (restoreError) {
      return {
        success: false,
        fromVersion,
        toVersion,
        rolledBack: false,
        message: `Migration failed and rollback failed: ${restoreError instanceof Error ? restoreError.message : 'unknown'}`,
      };
    }
  }
}

export async function getCurrentSchemaVersion(): Promise<number> {
  const raw = await storage.getItem(STORAGE_KEYS.SCHEMA_VERSION);
  return raw ? Number(raw) : 0;
}
