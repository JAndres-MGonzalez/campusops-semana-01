import type { IncidentDetail } from '../../src/domain/incident';
import { IncidentRequestError } from '../../src/domain/incident-request-error';
import { createPersistentQueue } from '../../src/infrastructure/persistence/queue';
import { createMemoryStorage } from '../../src/infrastructure/persistence/storage';
import { createOutbox } from '../../src/infrastructure/sync/outbox';
import { submitTechnicianStart } from '../../src/infrastructure/sync/technician-start';

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

test.each([undefined, 401])('un error de sesión (%s) no se presenta como reasignación', async (httpStatus) => {
  const authFailure = new IncidentRequestError('forbidden', httpStatus);
  const start = jest.fn();
  const operation = {
    operationId: 'op-start-expired-session',
    incidentId: 'campus-inc-001',
    author: 'technician-1',
    payload: { action: 'start' },
    baseVersion: 1,
    createdAt: 1793030400000,
    status: 'pending' as const,
    attempts: 0,
  };

  await expect(submitTechnicianStart(operation, { action: 'start' }, {
    find: async () => { throw authFailure; },
    start,
  })).rejects.toBe(authFailure);
  expect(start).not.toHaveBeenCalled();
});
