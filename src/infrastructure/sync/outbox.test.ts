/**
 * Outbox: conexión entre la cola persistente y las acciones de la app (Semana 8).
 * Verifica guardar sin conexión, reenviar con la misma identidad y retirar
 * únicamente lo confirmado, tanto en creaciones como en inicios de atención.
 */

import type { IncidentDetail, IncidentDraft } from '../../domain/incident';
import { createPersistentQueue } from '../persistence/queue';
import { createMemoryStorage } from '../persistence/storage';
import { OutboxConflictError, createOutbox } from './outbox';
import type { OutboxPayload, OutboxSubmit } from './outbox';

const DRAFT: IncidentDraft = {
  category: 'connectivity',
  description: 'Sin red en el laboratorio ficticio',
  location: 'Edificio de prueba A',
};

function draftOf(payload: OutboxPayload): IncidentDraft {
  if (payload.action !== 'create_incident') throw new Error('se esperaba una creación');
  return payload.draft;
}

function detailFor(operationId: string, draft: IncidentDraft): IncidentDetail {
  return {
    id: `server-${operationId}`,
    title: draft.description,
    category: draft.category,
    status: 'open',
    locationLabel: draft.location,
    description: draft.description,
    reportedBy: 'reporter-1',
    createdAt: '2026-10-26T20:00:00.000Z',
    updatedAt: null,
  };
}

function setup() {
  const store = createMemoryStorage();
  const queue = createPersistentQueue(store);
  const outbox = createOutbox(queue, () => 1761436800000);
  return { store, queue, outbox };
}

describe('outbox: guardar sin conexión y sincronizar', () => {
  it('guarda la intención y la recupera tras reiniciar la app', async () => {
    const { store, outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-offline-001', { author: 'technician-1' });

    // "Reinicio": nueva instancia de cola/outbox sobre el mismo almacenamiento.
    const restarted = createOutbox(createPersistentQueue(store));

    expect(await restarted.pendingCount()).toBe(1);
    const [pending] = await restarted.pending();
    expect(pending?.operationId).toBe('op-offline-001');
    expect(pending?.author).toBe('technician-1');
    expect(pending?.payload).toEqual({ action: 'create_incident', draft: DRAFT });
  });

  it('conserva la acción de inicio con su nota y referencia de fotografía', async () => {
    const { store, outbox } = setup();
    await outbox.saveAction({
      operationId: 'op-start-foto-001',
      incidentId: 'campus-inc-001',
      author: 'technician-1',
      payload: { action: 'start', note: 'Llegué al laboratorio A', evidenceIds: ['foto://lab-a/ingreso-01.jpg'] },
      baseVersion: 1,
    });

    // "Reinicio": la operación vuelve con el mismo contenido.
    const restarted = createOutbox(createPersistentQueue(store));
    const [pending] = await restarted.pending();
    expect(pending?.incidentId).toBe('campus-inc-001');
    expect(pending?.baseVersion).toBe(1);
    expect(pending?.payload).toEqual({
      action: 'start',
      note: 'Llegué al laboratorio A',
      evidenceIds: ['foto://lab-a/ingreso-01.jpg'],
    });
  });

  it('reenvía con la misma identidad y retira lo confirmado', async () => {
    const { outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-confirmada-001');

    const calls: string[] = [];
    const submit: OutboxSubmit = async (payload, operationId) => {
      calls.push(operationId);
      return detailFor(operationId, draftOf(payload));
    };

    const result = await outbox.flush(submit);

    expect(calls).toEqual(['op-confirmada-001']);
    expect(result.confirmed).toEqual(['op-confirmada-001']);
    expect(result.pending).toEqual([]);
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('envía un inicio de atención con la operación completa', async () => {
    const { outbox } = setup();
    await outbox.saveAction({
      operationId: 'op-start-technician-001',
      incidentId: 'campus-inc-001',
      author: 'technician-1',
      payload: { action: 'start', note: 'Inicio de atención' },
      baseVersion: 1,
    });

    const received: OutboxPayload[] = [];
    const result = await outbox.flush(async (payload) => {
      received.push(payload);
      return { ...detailFor('op-start-technician-001', DRAFT), status: 'in_progress' };
    });

    expect(received).toEqual([{ action: 'start', note: 'Inicio de atención' }]);
    expect(result.confirmed).toEqual(['op-start-technician-001']);
    expect(result.failed).toEqual([]);
    expect(result.conflicts).toEqual([]);
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('conserva la operación cuando el envío falla', async () => {
    const { outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-fallida-001');

    const result = await outbox.flush(async () => {
      throw new Error('network down');
    });

    expect(result.confirmed).toEqual([]);
    expect(result.failed).toEqual(['op-fallida-001']);
    const [pending] = await outbox.pending();
    expect(pending?.operationId).toBe('op-fallida-001');
    expect(pending?.status).toBe('failed');
    expect(await outbox.pendingCount()).toBe(1);
  });

  it('conserva la operación cuando el servidor no confirma (null)', async () => {
    const { outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-sin-confirmar-001');

    const result = await outbox.flush(async () => null);

    expect(result.confirmed).toEqual([]);
    expect(await outbox.pendingCount()).toBe(1);
    expect((await outbox.pending())[0]?.status).toBe('failed');
  });

  it('marca el conflicto y NO retira la operación de la cola', async () => {
    const { outbox } = setup();
    await outbox.saveAction({
      operationId: 'op-conflicto-001',
      incidentId: 'campus-inc-001',
      author: 'technician-1',
      payload: { action: 'start', note: 'Inicio que choca con una reasignación' },
      baseVersion: 1,
    });

    const result = await outbox.flush(async () => {
      throw new OutboxConflictError('op-conflicto-001', 'reassignment', ['work.assignedTechnicianId']);
    });

    expect(result.confirmed).toEqual([]);
    expect(result.failed).toEqual(['op-conflicto-001']);
    expect(result.conflicts).toEqual([{
      operationId: 'op-conflicto-001',
      reason: 'reassignment',
      fields: ['work.assignedTechnicianId'],
    }]);
    const [pending] = await outbox.pending();
    expect(pending?.operationId).toBe('op-conflicto-001');
    expect(pending?.status).toBe('failed');
    expect(pending?.payload).toEqual({ action: 'start', note: 'Inicio que choca con una reasignación' });
  });

  it('retira sólo lo confirmado cuando hay varias operaciones', async () => {
    const { outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-buena-001');
    await outbox.saveOffline(DRAFT, 'op-mala-001');

    const result = await outbox.flush(async (payload, operationId) => {
      if (operationId === 'op-mala-001') {
        throw new Error('conflict');
      }
      return detailFor(operationId, draftOf(payload));
    });

    expect(result.confirmed).toEqual(['op-buena-001']);
    expect(result.failed).toEqual(['op-mala-001']);
    expect(result.pending).toEqual(['op-mala-001']);
  });

  it('reintenta con el mismo operationId y conserva un solo registro', async () => {
    const { outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-reintento-001');

    await outbox.flush(async () => {
      throw new Error('timeout');
    });
    const calls: string[] = [];
    await outbox.flush(async (payload, operationId) => {
      calls.push(operationId);
      return detailFor(operationId, draftOf(payload));
    });

    expect(calls).toEqual(['op-reintento-001']);
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('no envía dos veces si dos reconexiones disparan flush a la vez', async () => {
    const { outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-concurrente-001');

    const calls: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const submit: OutboxSubmit = async (payload, operationId) => {
      calls.push(operationId);
      await gate;
      return detailFor(operationId, draftOf(payload));
    };

    const first = outbox.flush(submit);
    const second = outbox.flush(submit);
    expect(second).toBe(first);
    release?.();
    await Promise.all([first, second]);

    expect(calls).toEqual(['op-concurrente-001']);
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('repetir saveOffline no duplica ni cambia la primera intención', async () => {
    const { outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-duplicada-001');
    await outbox.saveOffline({ ...DRAFT, description: 'Otra descripción' }, 'op-duplicada-001');

    const pending = await outbox.pending();
    expect(pending).toHaveLength(1);
    expect((pending[0]?.payload as { draft: IncidentDraft }).draft).toEqual(DRAFT);
  });
});
