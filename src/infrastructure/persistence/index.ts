/**
 * Punto de entrada de persistencia (Semana 8)
 */

export { SCHEMA_VERSION, STORAGE_KEYS } from './schema';
export type { SchemaVersion, StorageKey } from './schema';
export { storage, createMemoryStorage } from './storage';
export type { PersistenceStorage } from './storage';
export { createPersistentQueue, pendingQueue } from './queue';
export type { PendingOperation, PersistentQueue, QueueOperationStatus } from './queue';
export { migrate, getCurrentSchemaVersion } from './migrations';
export type { MigrationSnapshot, MigrationResult, MigrationOptions } from './migrations';

import { migrate, getCurrentSchemaVersion } from './migrations';
import { SCHEMA_VERSION } from './schema';

export async function initializePersistence(): Promise<void> {
  const currentVersion = await getCurrentSchemaVersion();
  if (currentVersion < SCHEMA_VERSION) {
    await migrate();
  }
}
