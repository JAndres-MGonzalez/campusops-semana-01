/**
 * Outbox + política de reintentos (Semana 9).
 *
 * Comprueba que un fallo transitorio NO retira la operación de la cola, que se
 * informa como reintentable y que el límite publicado (intento 4) la vuelve a
 * dejar como fallo definitivo para revisión. La clave de operación nunca cambia.
 */

import type { IncidentDetail, IncidentDraft } from '../../domain/incident';
import { IncidentRequestError } from '../../domain/incident-request-error';
import { createPersistentQueue } from '../persistence/queue';
import { createMemoryStorage } from '../persistence/storage';
import { createOutbox } from './outbox';
import type { OutboxSubmit } from './outbox';

const DRAFT: IncidentDraft = {
  category: 'connectivity',
  description: 'Sin red en el laboratorio ficticio',
  location: 'Edificio de prueba A',
};

function detailFor(operationId: string): IncidentDetail {
  return {
    id: `server-${operationId}`,
    title: DRAFT.description,
    category: DRAFT.category,
    status: 'open',
    locationLabel: DRAFT.location,
    description: DRAFT.description,
    reportedBy: 'reporter-1',
    createdAt: '2026-10-26T20:00:00.000Z',
    updatedAt: null,
  };
}

function setup() {
  const store = createMemoryStorage();
  const queue = createPersistentQueue(store);
  const outbox = createOutbox(queue, () => 1761436800000);
  return { queue, outbox };
}

describe('outbox: reintentos acotados con la misma clave', () => {
  it('conserva la operación ante un timeout y la marca como reintentable', async () => {
    const { queue, outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-timeout-001');

    const result = await outbox.flush(async () => {
      throw new IncidentRequestError('timeout');
    });

    expect(result.confirmed).toEqual([]);
    expect(result.failed).toEqual(['op-timeout-001']);
    expect(result.retryable).toEqual(['op-timeout-001']);
    expect(result.pending).toEqual(['op-timeout-001']);
    expect((await queue.getById('op-timeout-001'))?.status).toBe('failed');
  });

  it('no marca como reintentable una validación ni un conflicto', async () => {
    const { outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-invalida-001');
    await outbox.saveOffline(DRAFT, 'op-conflicto-001');

    const submit: OutboxSubmit = async (_payload, operationId) => {
      throw new IncidentRequestError(operationId === 'op-invalida-001' ? 'validation' : 'conflict');
    };
    const result = await outbox.flush(submit);

    expect(result.failed).toEqual(['op-invalida-001', 'op-conflicto-001']);
    expect(result.retryable).toEqual([]);
  });

  it('reintenta con la clave original y confirma una sola vez', async () => {
    const { queue, outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-reintento-001');

    const keys: string[] = [];
    const first = await outbox.flush(async (_payload, operationId) => {
      keys.push(operationId);
      throw new IncidentRequestError('server', 503);
    });
    expect(first.retryable).toEqual(['op-reintento-001']);

    const second = await outbox.flush(async (_payload, operationId) => {
      keys.push(operationId);
      return detailFor(operationId);
    });

    expect(keys).toEqual(['op-reintento-001', 'op-reintento-001']);
    expect(second.confirmed).toEqual(['op-reintento-001']);
    expect(second.retryable).toEqual([]);
    expect(await queue.size()).toBe(0);
  });

  it('deja de reintentar desde el intento 4 sin sacar la operación de la cola', async () => {
    const { queue, outbox } = setup();
    await outbox.saveOffline(DRAFT, 'op-limite-001');

    const failing: OutboxSubmit = async () => {
      throw new IncidentRequestError('rate_limit', 429, 1);
    };

    // Cuatro envíos fallidos: `markInFlight` deja `attempts` en 4.
    for (let intento = 1; intento <= 4; intento += 1) {
      await outbox.flush(failing);
    }
    const last = await outbox.flush(failing);

    expect(last.confirmed).toEqual([]);
    expect(last.retryable).toEqual([]);
    expect(last.failed).toEqual(['op-limite-001']);
    expect(last.pending).toEqual(['op-limite-001']);
    expect((await queue.getById('op-limite-001'))?.attempts).toBe(5);
  });
});
