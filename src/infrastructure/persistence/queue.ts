/**
 * Cola PERSISTENTE de operaciones pendientes (Semana 8).
 * Cada operación debe tener operationId estable, incidencia/incidentId,
 * autor/author, contenido/payload, versión base y debe sobrevivir al reinicio.
 */

import { storage } from './storage';
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

export function createPersistentQueue(store: typeof storage = storage): PersistentQueue {
  return {
    async enqueue(operation: PendingOperation): Promise<void> {
      const existing = await this.getAll();
      // No duplicar por operationId - mantener integridad
      const filtered = existing.filter((op) => op.operationId !== operation.operationId);
      filtered.push(operation);
      await store.setItem(STORAGE_KEYS.PENDING_QUEUE, serialize(filtered));
    },

    async getAll(): Promise<readonly PendingOperation[]> {
      const raw = await store.getItem(STORAGE_KEYS.PENDING_QUEUE);
      return deserialize(raw);
    },

    async getById(operationId: string): Promise<PendingOperation | null> {
      const all = await this.getAll();
      const found = all.find((op) => op.operationId === operationId);
      return found ?? null;
    },

    async markInFlight(operationId: string): Promise<void> {
      const all = await this.getAll();
      const updated = all.map((op) =>
        op.operationId === operationId ? { ...op, status: 'in_flight' as const, attempts: op.attempts + 1 } : op,
      );
      await store.setItem(STORAGE_KEYS.PENDING_QUEUE, serialize(updated));
    },

    async markFailed(operationId: string): Promise<void> {
      const all = await this.getAll();
      const updated = all.map((op) => (op.operationId === operationId ? { ...op, status: 'failed' as const } : op));
      await store.setItem(STORAGE_KEYS.PENDING_QUEUE, serialize(updated));
    },

    async remove(operationId: string): Promise<void> {
      const all = await this.getAll();
      const filtered = all.filter((op) => op.operationId !== operationId);
      await store.setItem(STORAGE_KEYS.PENDING_QUEUE, serialize(filtered));
    },

    async clear(): Promise<void> {
      await store.setItem(STORAGE_KEYS.PENDING_QUEUE, serialize([]));
    },

    async size(): Promise<number> {
      const all = await this.getAll();
      return all.length;
    },
  };
}

export const pendingQueue = createPersistentQueue(storage);
