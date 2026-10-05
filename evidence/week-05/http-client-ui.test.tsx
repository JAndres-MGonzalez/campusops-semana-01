import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createIncident, getIncidentDetail, getIncidentList } from '../../src/application/incidents/use-cases';
import { HttpIncidentRepository } from '../../src/infrastructure/incidents/http-incident-repository';
import { reportIncidentFailure } from '../../src/infrastructure/telemetry/safe-telemetry';
import { IncidentApp } from '../../src/ui/IncidentApp';

const dto = { id: 'campus-inc-001', version: 1, status: 'assigned', payload: {
  category: 'connectivity', description: 'Falla ficticia de conexión', location: 'Zona de prueba', reporterId: 'reporter-1',
} };

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status,
    headers: { get: () => status === 429 ? '1' : null }, json: async () => body,
  } as unknown as Response;
}

function screen(fetchImpl: typeof fetch) {
  const repository = new HttpIncidentRepository('http://127.0.0.1:4310', { fetchImpl, timeoutMs: 40 });
  return render(<IncidentApp
    loadList={() => getIncidentList(repository)}
    loadDetail={(id) => getIncidentDetail(repository, id)}
    createIncident={(draft, key) => createIncident(repository, draft, key)}
    reportFailure={reportIncidentFailure}
  />);
}

test('consulta lista y detalle y crea una incidencia desde la pantalla mediante el cliente', async () => {
  const send = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      const draft = JSON.parse(init.body as string);
      return response({ incident: { ...dto, id: 'campus-inc-101', status: 'open', payload: { ...draft, reporterId: 'reporter-1' } } }, 201);
    }
    return response(String(input).endsWith('/v1/incidents') ? { items: [dto] } : dto);
  });
  const view = await screen(send);
  await waitFor(() => expect(view.getByText(dto.payload.description)).toBeTruthy());
  await fireEvent.press(view.getByText(dto.payload.description));
  await waitFor(() => expect(view.getByText(`ID: ${dto.id}`)).toBeTruthy());
  expect(view.getByText('Creada: No informada por el servidor')).toBeTruthy();
  await fireEvent.press(view.getByText('<- Volver a la lista'));
  await fireEvent.press(view.getByText('Nueva incidencia'));
  await fireEvent.changeText(view.getByLabelText('Descripción'), 'Falla ficticia del equipo');
  await fireEvent.changeText(view.getByLabelText('Ubicación'), 'Laboratorio de prueba');
  await fireEvent.press(view.getByRole('button', { name: 'Guardar incidencia' }));
  await waitFor(() => expect(view.getByText('ID: campus-inc-101')).toBeTruthy());
  const post = send.mock.calls.find(([, init]) => init?.method === 'POST')!;
  expect(post[1]?.headers).toMatchObject({ 'Content-Type': 'application/json', 'Idempotency-Key': expect.any(String) });
  expect(JSON.parse(post[1]?.body as string)).toEqual({
    category: 'maintenance', description: 'Falla ficticia del equipo', location: 'Laboratorio de prueba',
  });
});

test('la lista y el detalle con payload nulo muestran ausencia de datos', async () => {
  const nullable = { ...dto, payload: null };
  const list = await screen(async () => response({ items: [nullable] }));
  await waitFor(() => expect(list.getByText('No hay incidencias registradas.')).toBeTruthy());
  await list.unmount();
  const detail = await screen(async (input) => response(String(input).endsWith('/v1/incidents') ? { items: [dto] } : nullable));
  await waitFor(() => expect(detail.getByText(dto.payload.description)).toBeTruthy());
  await fireEvent.press(detail.getByText(dto.payload.description));
  await waitFor(() => expect(detail.getByText('No hay datos disponibles para esta incidencia.')).toBeTruthy());
  expect(detail.queryByText(`ID: ${dto.id}`)).toBeNull();
});

test.each([
  ['500', 'El servidor no pudo completar la solicitud.'],
  ['429', 'Hay demasiadas solicitudes. Intenta más tarde.'],
  ['json', 'La respuesta del servidor no es válida.'],
  ['domain', 'La respuesta del servidor no es válida.'],
  ['timeout', 'El servidor tardó demasiado. Intenta de nuevo.'],
  ['network', 'No hay conexión con el servidor.'],
])('el error %s mantiene la UI segura, sanitiza el log y permite reintentar', async (scenario, message) => {
  let fail = true;
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const view = await screen(async (_input, init) => {
      if (!fail) return response({ items: [dto] });
      if (scenario === 'network') throw new Error('persona@example.invalid credencial-ficticia');
      if (scenario === 'timeout') return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('credencial-ficticia')), { once: true });
      });
      if (scenario === 'json') return { ...response(null), json: async () => { throw new SyntaxError('persona@example.invalid'); } };
      if (scenario === 'domain') return response({ items: [{ ...dto, payload: { ...dto.payload, category: 'invalid' } }] });
      return response({ code: 'fixture_error', token: 'credencial-ficticia' }, Number(scenario));
    });
    await waitFor(() => expect(view.getByText(message)).toBeTruthy());
    expect(view.queryByText(dto.payload.description)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    const log = warn.mock.calls[0]![0] as string;
    expect(JSON.parse(log)).toEqual({ event: 'incident_load_failed', operation: 'list', error: '[REDACTED]' });
    for (const value of ['persona@example.invalid', 'credencial-ficticia']) {
      expect(log).not.toContain(value);
      expect(view.queryByText(value, { exact: false })).toBeNull();
    }
    fail = false;
    await fireEvent.press(view.getByText('Reintentar'));
    await waitFor(() => expect(view.getByText(dto.payload.description)).toBeTruthy());
  } finally { warn.mockRestore(); }
});

test('el formulario conserva sus datos y la clave de operación al repetir una creación fallida', async () => {
  const keys: string[] = [];
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const view = await screen(async (_input, init) => {
      if (init?.method !== 'POST') return response({ items: [] });
      keys.push((init.headers as Record<string, string>)['Idempotency-Key']!);
      if (keys.length === 1) return response({ code: 'controlled_failure' }, 500);
      return response({ incident: dto }, 201);
    });
    await waitFor(() => expect(view.getByText('Nueva incidencia')).toBeTruthy());
    await fireEvent.press(view.getByText('Nueva incidencia'));
    await fireEvent.changeText(view.getByLabelText('Descripción'), 'Falla ficticia de conexión');
    await fireEvent.changeText(view.getByLabelText('Ubicación'), 'Zona de prueba');
    await fireEvent.press(view.getByRole('button', { name: 'Guardar incidencia' }));
    await waitFor(() => expect(view.getByText('El servidor no pudo completar la solicitud.')).toBeTruthy());
    expect(view.getByLabelText('Descripción').props.value).toBe('Falla ficticia de conexión');
    expect(JSON.parse(warn.mock.calls[0]![0] as string)).toEqual({ event: 'incident_create_failed', operation: 'create', error: '[REDACTED]' });
    await fireEvent.press(view.getByRole('button', { name: 'Guardar incidencia' }));
    await waitFor(() => expect(view.getByText(`ID: ${dto.id}`)).toBeTruthy());
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  } finally { warn.mockRestore(); }
});

test('los datos incompletos del formulario se rechazan antes de enviar HTTP', async () => {
  const send = jest.fn(async () => response({ items: [] }));
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    const view = await screen(send);
    await waitFor(() => expect(view.getByText('Nueva incidencia')).toBeTruthy());
    await fireEvent.press(view.getByText('Nueva incidencia'));
    await fireEvent.press(view.getByRole('button', { name: 'Guardar incidencia' }));
    await waitFor(() => expect(view.getByText('Revisa la categoría, descripción y ubicación.')).toBeTruthy());
    expect(send).toHaveBeenCalledTimes(1);
  } finally { warn.mockRestore(); }
});
