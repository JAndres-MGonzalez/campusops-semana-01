/**
 * Bandeja de salida (outbox) de la Semana 8.
 *
 * Conecta la cola persistente con las acciones de la app:
 * 1. guarda la intención sin conexión (`saveOffline` / `saveAction`),
 * 2. la reenvía al reconectar con la MISMA identidad (`flush`),
 * 3. retira de la cola únicamente lo que el servidor confirmó.
 *
 * Un error, un timeout, una respuesta nula o un conflicto NO retiran la
 * operación: se marca `failed` y permanece para el siguiente intento.
 *
 * El envío recibe el payload completo, no sólo el borrador de creación, porque
 * la cola también conserva acciones sobre incidencias existentes (`start`).
 */

import type { IncidentDraft, IncidentDetail } from '../../domain/incident';
import { pendingQueue } from '../persistence/queue';
import type { PendingOperation, PersistentQueue } from '../persistence/queue';

/** Payload de una operación de creación de incidencia. */
export type CreateIncidentPayload = Readonly<{
  action: 'create_incident';
  draft: IncidentDraft;
}>;

/**
 * Payload de un inicio de atención. `note` y `evidenceIds` son metadatos de la
 * operación: la referencia de fotografía identifica el recurso y se conserva en
 * la cola, pero no se sube ningún archivo.
 */
export type StartPayload = Readonly<{
  action: 'start';
  note?: string;
  evidenceIds?: readonly string[];
}>;

export type OutboxPayload = CreateIncidentPayload | StartPayload;

/** Envía una operación y devuelve el recurso confirmado, o null si no hubo confirmación. */
export type OutboxSubmit = (
  payload: OutboxPayload,
  operationId: string,
  operation: PendingOperation,
) => Promise<IncidentDetail | null>;

/** Conflicto detectado al intentar enviar una operación. */
export type OutboxConflictReport = Readonly<{
  operationId: string;
  /** `reassignment`, `transition`, `missing` o `concurrent_change`. */
  reason: string;
  /** Campos incompatibles cuando la comparación pudo determinarlos. */
  fields: readonly string[];
}>;

export type OutboxFlushResult = Readonly<{
  /** Operaciones confirmadas y retiradas de la cola. */
  confirmed: readonly string[];
  /** Operaciones que siguen en la cola tras el intento. */
  pending: readonly string[];
  /** Operaciones cuyo envío falló o no se confirmó. */
  failed: readonly string[];
  /** Operaciones que chocaron con el estado remoto y siguen en la cola. */
  conflicts: readonly OutboxConflictReport[];
}>;

export type OutboxSaveOptions = Readonly<{
  author?: string;
  baseVersion?: number;
  createdAt?: number;
}>;

/** Operación nueva que se guarda en la cola antes de tocar la red. */
export type OutboxActionInput = Readonly<{
  operationId: string;
  incidentId: string;
  author: string;
  payload: OutboxPayload;
  baseVersion: number;
  createdAt?: number;
}>;

export interface Outbox {
  saveOffline(draft: IncidentDraft, operationId: string, options?: OutboxSaveOptions): Promise<PendingOperation>;
  saveAction(input: OutboxActionInput): Promise<PendingOperation>;
  pending(): Promise<readonly PendingOperation[]>;
  pendingCount(): Promise<number>;
  flush(submit: OutboxSubmit): Promise<OutboxFlushResult>;
}

/**
 * Conflicto de sincronización. No es un fallo de red: reintentar sin revisar el
 * estado remoto no cambiaría el resultado, así que la operación queda `failed`
 * en la cola y se informa a la UI. Nunca se retira del almacenamiento.
 */
export class OutboxConflictError extends Error {
  readonly operationId: string;
  readonly reason: string;
  readonly fields: readonly string[];

  constructor(operationId: string, reason: string, fields: readonly string[] = []) {
    super(`${reason}: ${operationId}`);
    this.name = 'OutboxConflictError';
    this.operationId = operationId;
    this.reason = reason;
    this.fields = fields;
  }
}

function readStringList(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

/** Lee un payload conocido; devuelve null si el registro no es utilizable. */
export function readOutboxPayload(operation: PendingOperation): OutboxPayload | null {
  const payload = operation.payload;
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (record.action === 'create_incident') {
    const draft = record.draft;
    if (draft === null || typeof draft !== 'object') return null;
    return { action: 'create_incident', draft: draft as IncidentDraft };
  }
  // `start_work` fue el nombre usado en la evidencia inicial de la semana; se
  // normaliza para que una cola antigua también pueda enviarse.
  if (record.action === 'start' || record.action === 'start_work') {
    const note = typeof record.note === 'string' && record.note.trim().length > 0 ? record.note : undefined;
    const evidenceIds = readStringList(record.evidenceIds);
    return {
      action: 'start',
      ...(note !== undefined ? { note } : {}),
      ...(evidenceIds !== undefined ? { evidenceIds } : {}),
    };
  }
  return null;
}

export function createOutbox(
  queue: PersistentQueue = pendingQueue,
  now: () => number = Date.now,
): Outbox {
  let running: Promise<OutboxFlushResult> | null = null;

  const runFlush = async (submit: OutboxSubmit): Promise<OutboxFlushResult> => {
    const confirmed: string[] = [];
    const failed: string[] = [];
    const conflicts: OutboxConflictReport[] = [];

    const operations = await queue.getAll();
    for (const operation of operations) {
      const payload = readOutboxPayload(operation);
      if (payload === null) {
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
        const detail = await submit(payload, operation.operationId, operation);
        if (detail === null) {
          await queue.markFailed(operation.operationId);
          failed.push(operation.operationId);
          continue;
        }
        // Sólo lo confirmado sale de la cola.
        await queue.remove(operation.operationId);
        confirmed.push(operation.operationId);
      } catch (error) {
        await queue.markFailed(operation.operationId);
        failed.push(operation.operationId);
        if (error instanceof OutboxConflictError) {
          conflicts.push({ operationId: error.operationId, reason: error.reason, fields: error.fields });
        }
      }
    }

    const remaining = await queue.getAll();
    return {
      confirmed,
      pending: remaining.map((operation) => operation.operationId),
      failed,
      conflicts,
    };
  };

  const saveAction = async (input: OutboxActionInput): Promise<PendingOperation> => {
    const operation: PendingOperation = {
      operationId: input.operationId,
      incidentId: input.incidentId,
      author: input.author,
      payload: input.payload,
      baseVersion: input.baseVersion,
      createdAt: input.createdAt ?? now(),
      status: 'pending',
      attempts: 0,
      idempotencyKey: input.operationId,
    };
    await queue.enqueue(operation);
    return operation;
  };

  return {
    saveOffline(draft, operationId, options = {}) {
      return saveAction({
        operationId,
        incidentId: `local-${operationId}`,
        author: options.author ?? 'reporter-1',
        payload: { action: 'create_incident', draft },
        baseVersion: options.baseVersion ?? 0,
        ...(options.createdAt !== undefined ? { createdAt: options.createdAt } : {}),
      });
    },

    saveAction,

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
