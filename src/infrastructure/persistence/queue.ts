/**
 * Cola PERSISTENTE de operaciones pendientes (Semana 8).
 * Cada operación debe tener operationId estable, incidencia/incidentId,
 * autor/author, contenido/payload, versión base y debe sobrevivir al reinicio.
 *
 * Integridad: todas las mutaciones se serializan por almacenamiento. Sin ese
 * candado, dos guardados simultáneos leen el mismo snapshot y el segundo pisa
 * al primero. Repetir un operationId conserva la PRIMERA operación: ni la
 * reemplaza ni la duplica.
 */

import { storage } from './storage';
import type { PersistenceStorage } from './storage';
import { STORAGE_KEYS } from './schema';

export type QueueOperationStatus = 'pending' | 'in_flight' | 'failed';

export interface PendingOperation {
  readonly operationId: string;
  readonly incidentId: string;
  readonly author: string;
  readonly payload: unknown;
  readonly baseVersion: number;
  readonly createdAt: number;
  readonly status: QueueOperationStatus;
  readonly attempts: number;
  readonly idempotencyKey?: string;
}

export interface PersistentQueue {
  enqueue(operation: PendingOperation): Promise<void>;
  getAll(): Promise<readonly PendingOperation[]>;
  getById(operationId: string): Promise<PendingOperation | null>;
  markInFlight(operationId: string): Promise<void>;
  markFailed(operationId: string): Promise<void>;
  remove(operationId: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
}

function serialize(queue: readonly PendingOperation[]): string {
  return JSON.stringify(queue);
}

function deserialize(raw: string | null): PendingOperation[] {
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as PendingOperation[];
    }
  } catch {
    // Si hay corrupción, retornamos array vacío pero el migrador puede restaurar snapshot
  }
  return [];
}

/**
 * Candado de escritura por almacenamiento. Es compartido entre instancias de
 * cola que apunten al mismo medio (por ejemplo, tras "reiniciar" la app).
 */
const storageLocks = new WeakMap<PersistenceStorage, Promise<void>>();

function withStorageLock<T>(store: PersistenceStorage, task: () => Promise<T>): Promise<T> {
  const previous = storageLocks.get(store) ?? Promise.resolve();
  const run = previous.then(task, task);
  storageLocks.set(
    store,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}

type QueueUpdate<T> = Readonly<{
  /** Nuevo contenido a persistir, o null si la operación no cambia la cola. */
  next: readonly PendingOperation[] | null;
  result: T;
}>;

export function createPersistentQueue(store: PersistenceStorage = storage): PersistentQueue {
  const read = async (): Promise<readonly PendingOperation[]> =>
    deserialize(await store.getItem(STORAGE_KEYS.PENDING_QUEUE));

  const write = (operations: readonly PendingOperation[]): Promise<void> =>
    store.setItem(STORAGE_KEYS.PENDING_QUEUE, serialize(operations));

  /**
   * Lectura y escritura dentro del mismo candado: el snapshot sobre el que se
   * calcula el cambio es el que se persiste.
   */
  const update = <T>(transform: (current: readonly PendingOperation[]) => QueueUpdate<T>): Promise<T> =>
    withStorageLock(store, async () => {
      const current = await read();
      const { next, result } = transform(current);
      if (next !== null) {
        await write(next);
      }
      return result;
    });

  const getAll = (): Promise<readonly PendingOperation[]> => withStorageLock(store, read);

  return {
    enqueue(operation: PendingOperation): Promise<void> {
      return update<void>((current) => {
        if (current.some((op) => op.operationId === operation.operationId)) {
          return { next: null, result: undefined };
        }
        return { next: [...current, operation], result: undefined };
      });
    },

    getAll,

    async getById(operationId: string): Promise<PendingOperation | null> {
      const all = await getAll();
      return all.find((op) => op.operationId === operationId) ?? null;
    },

    markInFlight(operationId: string): Promise<void> {
      return update<void>((current) => ({
        next: current.map((op) =>
          op.operationId === operationId
            ? { ...op, status: 'in_flight' as const, attempts: op.attempts + 1 }
            : op,
        ),
        result: undefined,
      }));
    },

    markFailed(operationId: string): Promise<void> {
      return update<void>((current) => ({
        next: current.map((op) =>
          op.operationId === operationId ? { ...op, status: 'failed' as const } : op,
        ),
        result: undefined,
      }));
    },

    remove(operationId: string): Promise<void> {
      return update<void>((current) => ({
        next: current.filter((op) => op.operationId !== operationId),
        result: undefined,
      }));
    },

    clear(): Promise<void> {
      return update<void>(() => ({ next: [], result: undefined }));
    },

    async size(): Promise<number> {
      const all = await getAll();
      return all.length;
    },
  };
}

export const pendingQueue = createPersistentQueue(storage);
