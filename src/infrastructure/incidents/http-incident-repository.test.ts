import type { IncidentDetail } from '../../domain/incident';
import { HttpIncidentRepository } from './http-incident-repository';

function response(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => body,
  } as unknown as Response;
}

const dto = {
  id: 'campus-inc-001',
  version: 1,
  status: 'assigned',
  payload: {
    category: 'connectivity',
    description: 'Falla ficticia de conectividad',
    location: 'Laboratorio de prueba',
    reporterId: 'reporter-1',
    assignedTechnicianId: 'technician-1',
  },
};

describe('repositorio HTTP de incidencias', () => {
  it('expone versión y técnico asignado en el detalle', async () => {
    const repository = new HttpIncidentRepository('http://127.0.0.1:4310', {
      fetchImpl: async () => response(dto),
    });

    const detail = await repository.findById('campus-inc-001');

    expect(detail?.version).toBe(1);
    expect(detail?.assignedTechnicianId).toBe('technician-1');
  });

  it('envía start con baseVersion, actor vigente y clave de idempotencia', async () => {
    let actor = 'technician-1';
    const calls: { url: string; init: RequestInit }[] = [];
    const repository = new HttpIncidentRepository('http://127.0.0.1:4310', {
      actorProvider: () => actor,
      tokenProvider: async () => 'token-de-prueba',
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        return response({ incident: { ...dto, version: 2, status: 'in_progress' } }, 201);
      },
    });

    const detail: IncidentDetail | null = await repository.start('campus-inc-001', 1, 'start-op-0001', {
      note: 'Llegué al laboratorio A',
      evidenceIds: ['foto://lab-a/ingreso-01.jpg'],
    });

    expect(detail?.status).toBe('in_progress');
    expect(calls[0]?.url).toBe('http://127.0.0.1:4310/v1/incidents/campus-inc-001/actions');
    expect(calls[0]?.init.method).toBe('POST');
    expect(calls[0]?.init.headers).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': 'start-op-0001',
      'X-Course-Actor': 'technician-1',
    });
    expect(JSON.parse(calls[0]?.init.body as string)).toEqual({
      action: 'start',
      baseVersion: 1,
      note: 'Llegué al laboratorio A',
      evidenceIds: ['foto://lab-a/ingreso-01.jpg'],
    });

    // El actor se lee en cada solicitud: cambiar de sesión no recrea el cliente.
    actor = 'technician-2';
    await repository.start('campus-inc-001', 2, 'start-op-0002');
    expect(calls[1]?.init.headers).toMatchObject({ 'X-Course-Actor': 'technician-2' });
  });

  it('rechaza operaciones sin identidad o versión válida antes de tocar la red', async () => {
    const send = jest.fn(async () => response(dto));
    const repository = new HttpIncidentRepository('http://127.0.0.1:4310', { fetchImpl: send });

    await expect(repository.start('campus-inc-001', 0, 'start-op-0003')).rejects.toMatchObject({ kind: 'validation' });
    await expect(repository.start('campus-inc-001', 1, 'corta')).rejects.toMatchObject({ kind: 'validation' });
    expect(send).not.toHaveBeenCalled();
  });
});
