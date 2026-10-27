/**
 * Evidencia reproducible Semana 8 - Parte A (Kevin, 3523110092).
 *
 * Ejecuta los casos reales sobre el nucleo de persistencia y la logica de sync:
 * reinicio de cola, migracion valida/fallida con rollback, conflicto,
 * combinacion de cambios independientes y deduplicacion por operationId.
 *
 * Comando:
 *   npx.cmd jest --ci --runInBand src/infrastructure/persistence/week-08-evidence.test.ts
 */

import { createPersistentQueue } from './queue';
import type { PendingOperation } from './queue';
import { createMemoryStorage, storage } from './storage';
import { getCurrentSchemaVersion, migrate } from './migrations';
import { SCHEMA_VERSION, STORAGE_KEYS } from './schema';
import { resolveSyncReal } from '../sync/resolve';
import { deduplicateOperationsReal } from '../sync/deduplicate';
import { OutboxConflictError, createOutbox } from '../sync/outbox';

const OPERATION: PendingOperation = {
  operationId: 'op-inicio-001',
  incidentId: 'inc-0001',
  author: 'tecnico-1',
  payload: { action: 'start_work', note: 'inicio de atencion sin conexion' },
  baseVersion: 1,
  createdAt: 1761436800000,
  status: 'pending',
  attempts: 0,
};

describe('week-08 parte A: persistencia y sync', () => {
  beforeEach(async () => {
    await storage.clear();
  });

  it('reinicio: la cola conserva operationId e incidente al recrear la instancia', async () => {
    const store = createMemoryStorage();
    const before = createPersistentQueue(store);
    await before.enqueue(OPERATION);

    // "Reinicio": nueva instancia de cola sobre el mismo almacenamiento persistente.
    const after = createPersistentQueue(store);
    const recovered = await after.getAll();

    const [first] = recovered;
    expect(recovered).toHaveLength(1);
    expect(first?.operationId).toBe('op-inicio-001');
    expect(first?.incidentId).toBe('inc-0001');
    expect(first?.author).toBe('tecnico-1');
    expect(first?.payload).toEqual(OPERATION.payload);
  });

  it('migracion fallida: revierte y no deja esquema parcial', async () => {
    await storage.setItem(STORAGE_KEYS.SCHEMA_VERSION, '0');
    await storage.setItem(STORAGE_KEYS.INCIDENTS, JSON.stringify([{ id: 'inc-0001' }]));
    await storage.setItem(STORAGE_KEYS.PENDING_QUEUE, JSON.stringify([OPERATION]));

    const failed = await migrate({ injectFailure: true });

    expect(failed.success).toBe(false);
    expect(failed.rolledBack).toBe(true);
    expect(await getCurrentSchemaVersion()).toBe(0);
    expect(JSON.parse((await storage.getItem(STORAGE_KEYS.INCIDENTS)) ?? '[]')).toEqual([
      { id: 'inc-0001' },
    ]);
    expect(JSON.parse((await storage.getItem(STORAGE_KEYS.PENDING_QUEUE)) ?? '[]')).toHaveLength(1);

    const recovered = await migrate();

    expect(recovered.success).toBe(true);
    expect(await getCurrentSchemaVersion()).toBe(SCHEMA_VERSION);
    expect(JSON.parse((await storage.getItem(STORAGE_KEYS.INCIDENTS)) ?? '[]')).toHaveLength(1);
    expect(JSON.parse((await storage.getItem(STORAGE_KEYS.PENDING_QUEUE)) ?? '[]')).toHaveLength(1);
  });

  it('conflicto: reasignacion concurrente conserva ambos hechos y no muta entradas', async () => {
    const base = {
      id: 'inc-0001',
      version: 1,
      fields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } },
    };
    const local = {
      id: 'inc-0001',
      version: 1,
      fields: { work: { assignedTechnicianId: 'technician-1', status: 'in_progress' } },
    };
    const remote = {
      id: 'inc-0001',
      version: 2,
      fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } },
    };
    const snapshot = [JSON.stringify(base), JSON.stringify(local), JSON.stringify(remote)];

    const result = resolveSyncReal(base, local, remote);

    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.fields).toEqual(['work']);
    }
    expect([JSON.stringify(base), JSON.stringify(local), JSON.stringify(remote)]).toEqual(snapshot);
  });

  it('combinacion: cambios independientes se fusionan sin mutar entradas', async () => {
    const base = { id: 'inc-0001', version: 1, fields: { title: 'Original', priority: 1 } };
    const local = { id: 'inc-0001', version: 1, fields: { title: 'Local', priority: 1 } };
    const remote = { id: 'inc-0001', version: 2, fields: { title: 'Original', priority: 2 } };
    const snapshot = [JSON.stringify(base), JSON.stringify(local), JSON.stringify(remote)];

    const result = resolveSyncReal(base, local, remote);

    expect(result).toEqual({ kind: 'merged', fields: { title: 'Local', priority: 2 } });
    expect([JSON.stringify(base), JSON.stringify(local), JSON.stringify(remote)]).toEqual(snapshot);
  });

  it('idempotencia: operationId repetido produce un solo efecto conservando la primera', () => {
    const operations = [
      { ...OPERATION, payload: { note: 'primera' } },
      { ...OPERATION, payload: { note: 'repetida' } },
      { ...OPERATION, operationId: 'op-inicio-002', payload: { note: 'otra' } },
    ];

    const result = deduplicateOperationsReal(operations);

    const [first, second] = result;
    expect(result).toHaveLength(2);
    expect(first?.payload).toEqual({ note: 'primera' });
    expect(second?.operationId).toBe('op-inicio-002');
    expect(operations).toHaveLength(3);
  });

  it('cola: guardados simultáneos no se pierden y repetir operationId conserva la primera', async () => {
    const queue = createPersistentQueue(createMemoryStorage());

    await queue.enqueue(OPERATION);
    await Promise.all([
      queue.enqueue({ ...OPERATION, operationId: 'op-simultanea-a', payload: { note: 'a' } }),
      queue.enqueue({ ...OPERATION, operationId: 'op-simultanea-b', payload: { note: 'b' } }),
    ]);
    await queue.enqueue({ ...OPERATION, payload: { note: 'repetida' } });

    const all = await queue.getAll();
    expect(all.map((op) => op.operationId).sort()).toEqual([
      'op-inicio-001',
      'op-simultanea-a',
      'op-simultanea-b',
    ]);
    expect(all.find((op) => op.operationId === 'op-inicio-001')?.payload).toEqual(OPERATION.payload);
  });

  it('conflicto: el orden de propiedades no cambia el contenido JSON', () => {
    const base = {
      id: 'inc-0001',
      version: 1,
      fields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } },
    };
    const local = {
      ...base,
      fields: { work: { status: 'assigned', assignedTechnicianId: 'technician-1' } },
    };
    const remote = { ...base, version: 2 };

    expect(resolveSyncReal(base, local, remote).kind).toBe('merged');
  });

  it('outbox: sólo se retira lo confirmado y se reintenta con la misma identidad', async () => {
    const outbox = createOutbox(createPersistentQueue(createMemoryStorage()), () => OPERATION.createdAt);
    const draft = {
      category: 'connectivity' as const,
      description: 'Sin red en el laboratorio ficticio',
      location: 'Edificio de prueba A',
    };
    await outbox.saveOffline(draft, 'op-outbox-001', { author: 'technician-1' });

    const failed = await outbox.flush(async () => {
      throw new Error('offline');
    });
    expect(failed.confirmed).toEqual([]);
    expect(failed.pending).toEqual(['op-outbox-001']);
    expect(await outbox.pendingCount()).toBe(1);

    const calls: string[] = [];
    const confirmed = await outbox.flush(async (sent, operationId) => {
      calls.push(operationId);
      if (sent.action !== 'create_incident') throw new Error('se esperaba create_incident');
      const draft = sent.draft;
      return {
        id: `server-${operationId}`,
        title: draft.description,
        category: draft.category,
        status: 'open',
        locationLabel: draft.location,
        description: draft.description,
        reportedBy: 'technician-1',
        createdAt: null,
        updatedAt: null,
      };
    });

    expect(calls).toEqual(['op-outbox-001']);
    expect(confirmed.confirmed).toEqual(['op-outbox-001']);
    expect(confirmed.pending).toEqual([]);
    expect(await outbox.pendingCount()).toBe(0);
  });

  it('inicio de atención: se envía completo y el conflicto de reasignación permanece en cola', async () => {
    const queue = createPersistentQueue(createMemoryStorage());
    const outbox = createOutbox(queue, () => OPERATION.createdAt);
    await outbox.saveAction({
      operationId: 'op-start-tecnico-001',
      incidentId: 'campus-inc-001',
      author: 'technician-1',
      payload: { action: 'start', note: 'Llegué al laboratorio A', evidenceIds: ['foto://lab-a/ingreso-01.jpg'] },
      baseVersion: 1,
    });

    // 1) Se envía la acción completa con su identidad estable.
    const received: unknown[] = [];
    const ok = await outbox.flush(async (payload, operationId) => {
      received.push({ payload, operationId });
      return {
        id: 'campus-inc-001', title: 'Falla ficticia', category: 'connectivity',
        status: 'in_progress', locationLabel: 'Edificio A', description: 'Revisión',
        reportedBy: 'reporter-1', createdAt: null, updatedAt: null,
      };
    });
    expect(received).toEqual([{
      operationId: 'op-start-tecnico-001',
      payload: { action: 'start', note: 'Llegué al laboratorio A', evidenceIds: ['foto://lab-a/ingreso-01.jpg'] },
    }]);
    expect(ok.confirmed).toEqual(['op-start-tecnico-001']);

    // 2) Tras una reasignación remota, la operación no se retira ni se sobrescribe.
    await outbox.saveAction({
      operationId: 'op-start-tecnico-002',
      incidentId: 'campus-inc-001',
      author: 'technician-1',
      payload: { action: 'start', note: 'Reintento tras reasignación' },
      baseVersion: 2,
    });
    const conflicted = await outbox.flush(async () => {
      throw new OutboxConflictError('op-start-tecnico-002', 'reassignment', ['work.assignedTechnicianId']);
    });
    expect(conflicted.conflicts).toEqual([{
      operationId: 'op-start-tecnico-002',
      reason: 'reassignment',
      fields: ['work.assignedTechnicianId'],
    }]);
    const pending = await outbox.pending();
    expect(pending.map((operation) => operation.operationId)).toEqual(['op-start-tecnico-002']);
    expect(pending[0]?.status).toBe('failed');
  });
});
