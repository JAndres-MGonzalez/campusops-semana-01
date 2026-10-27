/**
 * Decisión de envío del inicio de atención (Semana 8).
 *
 * Cubre los cuatro desenlaces que la cola debe distinguir: envío normal,
 * reasignación (incluida la pérdida de visibilidad), cambio independiente que se
 * puede reenviar con la versión vigente y operación ya aplicada.
 */

import type { IncidentDetail } from '../../domain/incident';
import { IncidentRequestError } from '../../domain/incident-request-error';
import type { PendingOperation } from '../persistence/queue';
import { OutboxConflictError } from './outbox';
import { submitTechnicianStart } from './technician-start';
import type { TechnicianStartTransport } from './technician-start';

const OPERATION: PendingOperation = {
  operationId: 'op-start-technician-001',
  incidentId: 'campus-inc-001',
  author: 'technician-1',
  payload: { action: 'start', note: 'Inicio de atención', evidenceIds: ['foto://lab-a/ingreso-01.jpg'] },
  baseVersion: 1,
  createdAt: 1793030400000,
  status: 'pending',
  attempts: 0,
  idempotencyKey: 'op-start-technician-001',
};

function remote(overrides: Partial<IncidentDetail> = {}): IncidentDetail {
  return {
    id: 'campus-inc-001',
    title: 'Falla de laboratorio ficticio',
    category: 'connectivity',
    status: 'assigned',
    locationLabel: 'Edificio ficticio A',
    description: 'Revisión de conectividad',
    reportedBy: 'reporter-1',
    createdAt: null,
    updatedAt: null,
    version: 1,
    assignedTechnicianId: 'technician-1',
    ...overrides,
  };
}

function transportFor(
  current: IncidentDetail | null | (() => never),
): Readonly<{ transport: TechnicianStartTransport; starts: Readonly<{ baseVersion: number; operationId: string; input: unknown }>[] }> {
  const starts: Readonly<{ baseVersion: number; operationId: string; input: unknown }>[] = [];
  const transport: TechnicianStartTransport = {
    find: async () => {
      if (typeof current === 'function') return current();
      return current;
    },
    start: async (_incidentId, baseVersion, operationId, input) => {
      starts.push({ baseVersion, operationId, input });
      return remote({ status: 'in_progress', version: baseVersion + 1 });
    },
  };
  return { transport, starts };
}

const payload = { action: 'start' as const, note: 'Inicio de atención', evidenceIds: ['foto://lab-a/ingreso-01.jpg'] };

describe('inicio de atención del técnico', () => {
  it('envía el inicio con la versión base y los metadatos de la operación', async () => {
    const { transport, starts } = transportFor(remote());

    const confirmed = await submitTechnicianStart(OPERATION, payload, transport);

    expect(confirmed.status).toBe('in_progress');
    expect(starts).toEqual([{
      baseVersion: 1,
      operationId: 'op-start-technician-001',
      input: { note: 'Inicio de atención', evidenceIds: ['foto://lab-a/ingreso-01.jpg'] },
    }]);
  });

  it('no impone el inicio cuando la incidencia fue reasignada a otro técnico', async () => {
    const { transport, starts } = transportFor(remote({ assignedTechnicianId: 'technician-2', version: 2 }));

    await expect(submitTechnicianStart(OPERATION, payload, transport)).rejects.toMatchObject({
      name: 'OutboxConflictError',
      reason: 'reassignment',
      fields: ['work.assignedTechnicianId'],
    });
    expect(starts).toEqual([]);
  });

  it('trata la pérdida de visibilidad (403) como reasignación', async () => {
    const { transport, starts } = transportFor(() => {
      throw new IncidentRequestError('forbidden', 403);
    });

    await expect(submitTechnicianStart(OPERATION, payload, transport)).rejects.toBeInstanceOf(OutboxConflictError);
    expect(starts).toEqual([]);
  });

  it('reenvía con la versión remota vigente cuando sólo cambió un campo independiente', async () => {
    const { transport, starts } = transportFor(remote({ version: 3 }));

    await submitTechnicianStart(OPERATION, payload, transport);

    expect(starts[0]?.baseVersion).toBe(3);
  });

  it('considera confirmado el inicio si ya quedó en progreso para el mismo técnico', async () => {
    const { transport, starts } = transportFor(remote({ status: 'in_progress', version: 2 }));

    const confirmed = await submitTechnicianStart(OPERATION, payload, transport);

    expect(confirmed.status).toBe('in_progress');
    expect(starts).toEqual([]);
  });

  it('informa conflicto de transición si la incidencia ya avanzó a resuelta', async () => {
    const { transport, starts } = transportFor(remote({ status: 'resolved', version: 4 }));

    await expect(submitTechnicianStart(OPERATION, payload, transport)).rejects.toMatchObject({
      reason: 'transition',
      fields: ['work.status'],
    });
    expect(starts).toEqual([]);
  });

  it('propaga el 409 del servidor como operación no confirmada', async () => {
    const transport: TechnicianStartTransport = {
      find: async () => remote({ version: 2 }),
      start: async () => {
        throw new IncidentRequestError('conflict', 409);
      },
    };

    await expect(submitTechnicianStart(OPERATION, payload, transport))
      .rejects.toBeInstanceOf(IncidentRequestError);
  });
});
