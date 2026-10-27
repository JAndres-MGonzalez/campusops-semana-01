/**
 * Inicio de atención del técnico sobre una incidencia ya existente (Semana 8).
 *
 * El caso difícil no es enviar `start`, es decidir QUÉ hacer cuando la copia
 * remota cambió mientras la operación esperaba en la cola:
 *
 * - ya está `in_progress` y sigue asignada al mismo técnico -> ya se aplicó;
 * - la asignación visible es de otro técnico (o el servidor responde 403/404 al
 *   consultarla) -> reasignación: conflicto, no se impone el técnico anterior;
 * - sólo cambió un campo independiente (por ejemplo la prioridad) -> se
 *   reenvía con la versión remota vigente, sin perder la intención local;
 * - `baseVersion` sigue siendo el candado final del servidor: si algo cambió
 *   entre la consulta y el envío, el servidor responde 409 y la operación
 *   permanece en la cola.
 *
 * Las notas y las referencias de fotografía son metadatos de la operación; la
 * cola las conserva aunque el envío no se confirme.
 */

import type { IncidentDetail } from '../../domain/incident';
import { IncidentRequestError } from '../../domain/incident-request-error';
import type { PendingOperation } from '../persistence/queue';
import { OutboxConflictError } from './outbox';
import type { StartPayload } from './outbox';
import { resolveSyncReal } from './resolve';
import type { SyncRecord } from './resolve';

export type TechnicianStartTransport = Readonly<{
  find(incidentId: string): Promise<IncidentDetail | null>;
  start(
    incidentId: string,
    baseVersion: number,
    operationId: string,
    input: Readonly<{ note?: string; evidenceIds?: readonly string[] }>,
  ): Promise<IncidentDetail | null>;
}>;

function workRecord(assignedTechnicianId: string | null, status: string): SyncRecord {
  return {
    id: 'work',
    version: 0,
    fields: { work: { assignedTechnicianId, status } },
  };
}

async function findRemote(
  operation: PendingOperation,
  transport: TechnicianStartTransport,
): Promise<IncidentDetail> {
  let remote: IncidentDetail | null;
  try {
    remote = await transport.find(operation.incidentId);
  } catch (error) {
    // Perder la visibilidad de la incidencia es exactamente lo que provoca una
    // reasignación: el backend valida la asignación antes que la versión y
    // responde 403 (o 404 si el recurso dejó de estar disponible).
    // Una sesión vencida sin respuesta HTTP no demuestra una reasignación.
    if (error instanceof IncidentRequestError
      && ((error.kind === 'forbidden' && error.httpStatus === 403)
        || (error.kind === 'not_found' && error.httpStatus === 404))) {
      throw new OutboxConflictError(operation.operationId, 'reassignment', ['work.assignedTechnicianId']);
    }
    throw error;
  }
  if (remote === null) {
    throw new OutboxConflictError(operation.operationId, 'missing', ['id']);
  }
  return remote;
}

/**
 * Envía el inicio o lanza una razón concreta de conflicto. Devuelve el detalle
 * confirmado por el servidor (o la copia remota cuando ya estaba aplicado).
 */
export async function submitTechnicianStart(
  operation: PendingOperation,
  payload: StartPayload,
  transport: TechnicianStartTransport,
): Promise<IncidentDetail> {
  const remote = await findRemote(operation, transport);

  // 1. La asignación vigente manda: nunca se inicia una incidencia que ya es de
  //    otro técnico, aunque la intención local sea anterior.
  if ((remote.assignedTechnicianId ?? null) !== operation.author) {
    throw new OutboxConflictError(operation.operationId, 'reassignment', ['work.assignedTechnicianId']);
  }

  // 2. Un intento anterior pudo aplicarse y perderse la respuesta.
  if (remote.status === 'in_progress') {
    return remote;
  }

  // 3. Estados posteriores: alguien avanzó la incidencia sin este inicio.
  if (remote.status !== 'assigned') {
    throw new OutboxConflictError(operation.operationId, 'transition', ['work.status']);
  }

  // 4. Comparación por campo contra la base registrada al encolar.
  const comparison = resolveSyncReal(
    workRecord(operation.author, 'assigned'),
    workRecord(operation.author, 'in_progress'),
    workRecord(remote.assignedTechnicianId ?? null, remote.status),
  );
  if (comparison.kind === 'conflict') {
    throw new OutboxConflictError(operation.operationId, 'concurrent_change', comparison.fields);
  }
  // La combinación sólo es válida si conserva el inicio local; si el remoto
  // impuso otro estado, se informa en lugar de sobrescribirlo.
  const mergedWork = comparison.fields.work;
  const mergedStatus = mergedWork !== null && typeof mergedWork === 'object'
    ? (mergedWork as Record<string, unknown>).status
    : undefined;
  if (mergedStatus !== 'in_progress') {
    throw new OutboxConflictError(operation.operationId, 'concurrent_change', ['work.status']);
  }

  // 5. Cambio independiente: se reenvía con la versión remota actual. El
  //    servidor vuelve a validar asignación y versión al aplicar la acción.
  const confirmed = await transport.start(
    operation.incidentId,
    remote.version ?? operation.baseVersion,
    operation.operationId,
    {
      ...(payload.note !== undefined ? { note: payload.note } : {}),
      ...(payload.evidenceIds !== undefined ? { evidenceIds: payload.evidenceIds } : {}),
    },
  );
  if (confirmed === null) {
    throw new Error(`start sin confirmación: ${operation.operationId}`);
  }
  return confirmed;
}
