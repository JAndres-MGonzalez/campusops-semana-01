import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { createSecureSessionStorage } from '../../src/infrastructure/session/secure-storage';

jest.mock('../../src/infrastructure/session/secure-storage', () => {
  let token: string | null = null;
  const storage = {
    read: async () => token,
    write: async (value: string) => { token = value; },
    clear: async () => { token = null; },
  };
  return { createSecureSessionStorage: () => storage };
});

function response(body: unknown): Response {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

test('la app inicia sesión, muestra incidencias y elimina la sesión al salir', async () => {
  const previousFetch = globalThis.fetch;
  let incidentCalls = 0;
  globalThis.fetch = jest.fn(async (input) => {
    const url = String(input);
    if (url.endsWith('/health')) return response({ ok: true, contractVersion: 1, service: 'dmi-controlled-backend' });
    if (url.endsWith('/v1/session/login')) {
      return response({ actorId: 'reporter-1', role: 'reporter', accessToken: 'course-valid-token',
        refreshToken: 'course-refresh-0', expiresIn: 60 });
    }
    incidentCalls++;
    return response({ items: [] });
  });
  try {
    const { default: App } = jest.requireActual<typeof import('../../App')>('../../App');
    const view = await render(<App />);
    expect(view.getByTestId('session-hint')).toBeTruthy();
    expect(incidentCalls).toBe(0);
    await fireEvent.press(view.getByText('Iniciar sesión (reportante)'));
    await waitFor(() => expect(view.getByText('Cerrar sesión')).toBeTruthy());
    await waitFor(() => expect(view.getByText('No hay incidencias registradas.')).toBeTruthy());
    expect(await createSecureSessionStorage().read() !== null).toBe(true);
    expect(incidentCalls).toBe(1);
    await fireEvent.press(view.getByText('Cerrar sesión'));
    await waitFor(() => expect(view.getByTestId('session-hint')).toBeTruthy());
    expect(await createSecureSessionStorage().read()).toBeNull();
    expect(view.queryByText('Nueva incidencia')).toBeNull();
    expect(incidentCalls).toBe(1);
    await view.unmount();
  } finally {
    globalThis.fetch = previousFetch;
  }
});
