/**
 * Bandeja de salida (outbox) de la Semana 8.
 *
 * Conecta la cola persistente con las acciones de la app:
 * 1. guarda la intención sin conexión (`saveOffline`),
 * 2. la reenvía al reconectar con la MISMA identidad (`flush`),
 * 3. retira de la cola únicamente lo que el servidor confirmó.
 *
 * Un error, un timeout, una respuesta nula o un conflicto NO retiran la
 * operación: se marca `failed` y permanece para el siguiente intento.
 */

import type { IncidentDraft, IncidentDetail } from '../../domain/incident';
import { pendingQueue } from '../persistence/queue';
import type { PendingOperation, PersistentQueue } from '../persistence/queue';

/** Envía una operación y devuelve el recurso confirmado, o null si no hubo confirmación. */
export type OutboxSubmit = (
  draft: IncidentDraft,
  operationId: string,
) => Promise<IncidentDetail | null>;

export type OutboxFlushResult = Readonly<{
  /** Operaciones confirmadas y retiradas de la cola. */
  confirmed: readonly string[];
  /** Operaciones que siguen en la cola tras el intento. */
  pending: readonly string[];
  /** Operaciones cuyo envío falló o no se confirmó. */
  failed: readonly string[];
}>;

export type OutboxSaveOptions = Readonly<{
  author?: string;
  baseVersion?: number;
  createdAt?: number;
}>;

export interface Outbox {
  saveOffline(draft: IncidentDraft, operationId: string, options?: OutboxSaveOptions): Promise<PendingOperation>;
  pending(): Promise<readonly PendingOperation[]>;
  pendingCount(): Promise<number>;
  flush(submit: OutboxSubmit): Promise<OutboxFlushResult>;
}

/** Payload de una operación de creación de incidencia. */
export type CreateIncidentPayload = Readonly<{
  action: 'create_incident';
  draft: IncidentDraft;
}>;

function readDraft(operation: PendingOperation): IncidentDraft | null {
  const payload = operation.payload as Partial<CreateIncidentPayload> | null;
  if (payload === null || typeof payload !== 'object' || payload.action !== 'create_incident') {
    return null;
  }
  const draft = payload.draft;
  if (draft === null || typeof draft !== 'object') {
    return null;
  }
  return draft;
}

export function createOutbox(
  queue: PersistentQueue = pendingQueue,
  now: () => number = Date.now,
): Outbox {
  let running: Promise<OutboxFlushResult> | null = null;

  const runFlush = async (submit: OutboxSubmit): Promise<OutboxFlushResult> => {
    const confirmed: string[] = [];
    const failed: string[] = [];

    const operations = await queue.getAll();
    for (const operation of operations) {
      const draft = readDraft(operation);
      if (draft === null) {
        // Dato inválido en la cola: no se puede confirmar, se conserva marcado.
        await queue.markFailed(operation.operationId);
        failed.push(operation.operationId);
        continue;
      }

      // El intento queda registrado antes de tocar la red. Si la app se cierra
      // a mitad del envío, el reintento usa el mismo operationId y el servidor
      // lo deduplica (no produce un segundo efecto).
      await queue.markInFlight(operation.operationId);
      try {
        const detail = await submit(draft, operation.operationId);
        if (detail === null) {
          await queue.markFailed(operation.operationId);
          failed.push(operation.operationId);
          continue;
        }
        // Sólo lo confirmado sale de la cola.
        await queue.remove(operation.operationId);
        confirmed.push(operation.operationId);
      } catch {
        await queue.markFailed(operation.operationId);
        failed.push(operation.operationId);
      }
    }

    const remaining = await queue.getAll();
    return {
      confirmed,
      pending: remaining.map((operation) => operation.operationId),
      failed,
    };
  };

  return {
    async saveOffline(draft, operationId, options = {}) {
      const operation: PendingOperation = {
        operationId,
        incidentId: `local-${operationId}`,
        author: options.author ?? 'reporter-1',
        payload: { action: 'create_incident', draft } satisfies CreateIncidentPayload,
        baseVersion: options.baseVersion ?? 0,
        createdAt: options.createdAt ?? now(),
        status: 'pending',
        attempts: 0,
        idempotencyKey: operationId,
      };
      await queue.enqueue(operation);
      return operation;
    },

    pending(): Promise<readonly PendingOperation[]> {
      return queue.getAll();
    },

    pendingCount(): Promise<number> {
      return queue.size();
    },

    flush(submit: OutboxSubmit): Promise<OutboxFlushResult> {
      // Single-flight: dos reconexiones simultáneas no envían dos veces lo mismo.
      if (running !== null) {
        return running;
      }
      running = runFlush(submit).finally(() => {
        running = null;
      });
      return running;
    },
  };
}

export const outbox = createOutbox(pendingQueue);
