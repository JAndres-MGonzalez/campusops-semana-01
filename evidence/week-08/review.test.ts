import { createPersistentQueue, type PendingOperation } from '../../src/infrastructure/persistence/queue';
import { createMemoryStorage } from '../../src/infrastructure/persistence/storage';
import { resolveSync } from '../../src/course-evaluation';

const operation: PendingOperation = {
  operationId: 'op-review-001',
  incidentId: 'campus-inc-001',
  author: 'technician-1',
  payload: { action: 'start', note: 'Revisión del equipo de prueba' },
  baseVersion: 1,
  createdAt: 1793030400000,
  status: 'pending',
  attempts: 0,
};

test('reencolar una operación conserva su primer registro', async () => {
  const queue = createPersistentQueue(createMemoryStorage());
  await queue.enqueue(operation);
  await queue.enqueue({ ...operation, createdAt: operation.createdAt + 1 });

  expect(await queue.getAll()).toEqual([operation]);
});

test('dos escrituras simultáneas conservan ambas operaciones', async () => {
  const queue = createPersistentQueue(createMemoryStorage());
  const second = { ...operation, operationId: 'op-review-002' };

  await Promise.all([queue.enqueue(operation), queue.enqueue(second)]);

  expect((await queue.getAll()).map((item) => item.operationId).sort()).toEqual([
    'op-review-001',
    'op-review-002',
  ]);
});

test('objetos JSON con las mismas propiedades no generan un conflicto por su orden', () => {
  const base = { id: 'campus-inc-001', version: 1, fields: { note: {} } };
  const local = { ...base, fields: { note: { building: 'A', room: '1' } } };
  const remote = { ...base, version: 2, fields: { note: { room: '1', building: 'A' } } };

  expect(resolveSync(base, local, remote)).toEqual({
    kind: 'merged',
    fields: { note: { building: 'A', room: '1' } },
  });
});
