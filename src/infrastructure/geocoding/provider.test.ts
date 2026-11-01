import { IncidentRequestError } from '../../domain/incident-request-error';
import { createHttpGeocodingProvider } from './provider';

const BASE = 'http://backend.test';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function failureOf(promise: Promise<unknown>): Promise<IncidentRequestError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(IncidentRequestError);
    return error as IncidentRequestError;
  }
  throw new Error('se esperaba un rechazo');
}

test('envía la consulta codificada con token, actor y escenario opcional', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { label: 'Edificio', latitude: 0, longitude: 0 }));
  const lookup = createHttpGeocodingProvider({
    baseUrl: BASE,
    fetchImpl,
    tokenProvider: async () => 'token-prueba',
    actorProvider: () => 'reporter-1',
    scenario: 'slow',
  });

  await expect(lookup('  Zona A & B ')).resolves.toEqual({ label: 'Edificio', latitude: 0, longitude: 0 });

  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
  expect(url).toBe(`${BASE}/v1/geocoding?q=${encodeURIComponent('Zona A & B')}`);
  expect(init.method).toBe('GET');
  expect(init.headers).toEqual({
    Authorization: 'Bearer token-prueba',
    'X-Course-Actor': 'reporter-1',
    'X-Course-Scenario': 'slow',
  });
});

test('sin escenario configurado no envía X-Course-Scenario', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, {}));
  await createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't', actorProvider: () => 'a' })('x');
  const init = (fetchImpl.mock.calls[0] as [string, RequestInit])[1];
  expect(Object.keys(init.headers as Record<string, string>)).not.toContain('X-Course-Scenario');
});

test('devuelve el JSON tal cual, aunque no sea una ubicación válida', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(200, { label: 'Zona ficticia' }));
  const lookup = createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't' });
  await expect(lookup('x')).resolves.toEqual({ label: 'Zona ficticia' });
});

test('429 conserva retryAfterSeconds', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(429, { code: 'rate_limited' }, { 'retry-after': '1' }));
  const error = await failureOf(createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't' })('x'));
  expect(error.kind).toBe('rate_limit');
  expect(error.httpStatus).toBe(429);
  expect(error.retryAfterSeconds).toBe(1);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test.each([
  [500, 'server'], [503, 'server'], [401, 'forbidden'], [403, 'forbidden'],
  [404, 'not_found'], [400, 'validation'], [422, 'validation'],
] as const)('HTTP %i se traduce a %s', async (status, kind) => {
  const fetchImpl = jest.fn().mockResolvedValue(jsonResponse(status, { code: 'x' }));
  const error = await failureOf(createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't' })('x'));
  expect(error.kind).toBe(kind);
});

test('JSON roto se traduce a contract', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(new Response('{"label": [}', { status: 200 }));
  const error = await failureOf(createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't' })('x'));
  expect(error.kind).toBe('contract');
});

test('un fetch que nunca resuelve termina en timeout', async () => {
  const fetchImpl = jest.fn(() => new Promise<Response>(() => undefined));
  const lookup = createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't', timeoutMs: 20 });
  const error = await failureOf(lookup('x'));
  expect(error.kind).toBe('timeout');
});

test('un fetch que rechaza por abortar también es timeout', async () => {
  const fetchImpl = jest.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  }));
  const lookup = createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't', timeoutMs: 20 });
  expect((await failureOf(lookup('x'))).kind).toBe('timeout');
});

test('un fallo de transporte se traduce a network', async () => {
  const fetchImpl = jest.fn().mockRejectedValue(new TypeError('Network request failed'));
  const error = await failureOf(createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't' })('x'));
  expect(error.kind).toBe('network');
});

test('sin token lanza forbidden sin tocar la red', async () => {
  const fetchImpl = jest.fn();
  const lookup = createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => null });
  expect((await failureOf(lookup('x'))).kind).toBe('forbidden');
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('cada llamada usa su propio temporizador: un timeout no afecta a la siguiente', async () => {
  const fetchImpl = jest.fn()
    .mockImplementationOnce(() => new Promise<Response>(() => undefined))
    .mockResolvedValueOnce(jsonResponse(200, { label: 'Edificio', latitude: 1, longitude: 2 }));
  const lookup = createHttpGeocodingProvider({ baseUrl: BASE, fetchImpl, tokenProvider: async () => 't', timeoutMs: 20 });
  expect((await failureOf(lookup('x'))).kind).toBe('timeout');
  await expect(lookup('x')).resolves.toMatchObject({ latitude: 1 });
});
