import type { IncidentDetail } from '../../src/domain/incident';
import { createPersistentQueue } from '../../src/infrastructure/persistence/queue';
import { createMemoryStorage } from '../../src/infrastructure/persistence/storage';
import { createOutbox } from '../../src/infrastructure/sync/outbox';

test('envía un inicio de atención pendiente con su identidad estable', async () => {
  const queue = createPersistentQueue(createMemoryStorage());
  await queue.enqueue({
    operationId: 'op-start-technician-001',
    incidentId: 'campus-inc-001',
    author: 'technician-1',
    payload: { action: 'start', note: 'Inicio de atención del equipo de prueba' },
    baseVersion: 1,
    createdAt: 1793030400000,
    status: 'pending',
    attempts: 0,
  });

  const confirmed: IncidentDetail = {
    id: 'campus-inc-001',
    title: 'Falla de laboratorio ficticio',
    category: 'connectivity',
    status: 'in_progress',
    locationLabel: 'Edificio ficticio A',
    description: 'Revisión de conectividad',
    reportedBy: 'reporter-1',
    createdAt: null,
    updatedAt: null,
  };
  const submitted: string[] = [];
  const result = await createOutbox(queue).flush(async (_draft, operationId) => {
    submitted.push(operationId);
    return confirmed;
  });

  expect(submitted).toEqual(['op-start-technician-001']);
  expect(result.confirmed).toEqual(['op-start-technician-001']);
  expect(await queue.size()).toBe(0);
});
