/**
 * Punto de entrada de persistencia (Semana 8)
 */

export { SCHEMA_VERSION, STORAGE_KEYS } from './schema';
export type { SchemaVersion, StorageKey } from './schema';
export { storage, createMemoryStorage, createDurableStorage } from './storage';
export type { PersistenceStorage } from './storage';
export { createPersistentQueue, pendingQueue } from './queue';
export type { PendingOperation, PersistentQueue, QueueOperationStatus } from './queue';
export { migrate, getCurrentSchemaVersion } from './migrations';
export type { MigrationSnapshot, MigrationResult, MigrationOptions } from './migrations';

import { migrate, getCurrentSchemaVersion } from './migrations';
import { SCHEMA_VERSION } from './schema';
import { storage } from './storage';

export async function initializePersistence(): Promise<void> {
  const currentVersion = await getCurrentSchemaVersion();
  if (currentVersion < SCHEMA_VERSION) {
    await migrate();
  }
  // Asegurar que la cola e incidencias se cargan desde almacenamiento duradero
  // al inicializar la persistencia
  try {
    await storage.getItem('campusops.queue.pending');
    await storage.getItem('campusops.data.incidents');
  } catch {
    // Ignorar errores de inicialización
  }
}
