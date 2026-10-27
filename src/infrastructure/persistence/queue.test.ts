/**
 * Integridad de la cola persistente (Semana 8).
 * Cubre los dos casos que el revisor marcó como faltantes:
 * 1. repetir operationId conserva la PRIMERA operación,
 * 2. dos guardados simultáneos no se pisan.
 */

import { createPersistentQueue } from './queue';
import type { PendingOperation } from './queue';
import { createMemoryStorage } from './storage';

function operation(operationId: string, note: string): PendingOperation {
  return {
    operationId,
    incidentId: 'campus-inc-001',
    author: 'technician-1',
    payload: { note },
    baseVersion: 1,
    createdAt: 1761436800000,
    status: 'pending',
    attempts: 0,
  };
}

describe('cola persistente: identidad e integridad', () => {
  it('conserva la primera operación al repetir operationId', async () => {
    const queue = createPersistentQueue(createMemoryStorage());

    await queue.enqueue(operation('op-repetida-001', 'primera'));
    await queue.enqueue(operation('op-repetida-001', 'repetida'));

    const all = await queue.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]?.payload).toEqual({ note: 'primera' });
  });

  it('no pierde datos al guardar dos operaciones simultáneamente', async () => {
    const queue = createPersistentQueue(createMemoryStorage());

    await Promise.all([
      queue.enqueue(operation('op-simultanea-a', 'a')),
      queue.enqueue(operation('op-simultanea-b', 'b')),
    ]);

    const ids = (await queue.getAll()).map((op) => op.operationId).sort();
    expect(ids).toEqual(['op-simultanea-a', 'op-simultanea-b']);
  });

  it('serializa escrituras entre dos instancias sobre el mismo almacenamiento', async () => {
    const store = createMemoryStorage();
    const first = createPersistentQueue(store);
    const second = createPersistentQueue(store);

    await Promise.all([
      first.enqueue(operation('op-instancia-a', 'a')),
      second.enqueue(operation('op-instancia-b', 'b')),
    ]);

    expect(await second.size()).toBe(2);
  });

  it('un cambio de estado concurrente no borra un alta simultánea', async () => {
    const queue = createPersistentQueue(createMemoryStorage());
    await queue.enqueue(operation('op-existente-001', 'existente'));

    await Promise.all([
      queue.markInFlight('op-existente-001'),
      queue.enqueue(operation('op-nueva-001', 'nueva')),
    ]);

    const all = await queue.getAll();
    expect(all).toHaveLength(2);
    expect(all.find((op) => op.operationId === 'op-existente-001')?.status).toBe('in_flight');
    expect(all.find((op) => op.operationId === 'op-nueva-001')?.status).toBe('pending');
  });
});
