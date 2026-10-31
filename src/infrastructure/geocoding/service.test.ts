import { IncidentRequestError } from '../../domain/incident-request-error';
import { createLocationCache } from './cache';
import type { LocationObservation } from './service';
import { createLocationService } from './service';

const valid = { label: 'Edificio de prueba A', latitude: 0, longitude: 0 };

test('(0,0) es válido: viene del proveedor, queda en caché y la segunda búsqueda no llama al proveedor', async () => {
  const lookup = jest.fn().mockResolvedValue(valid);
  const cache = createLocationCache();
  const service = createLocationService({ lookup, cache });

  const first = await service.resolve('Zona A', 'Zona A');
  expect(first).toEqual({
    location: { source: 'provider', label: 'Edificio de prueba A', latitude: 0, longitude: 0 },
    origin: 'provider',
    failure: null,
  });
  expect(cache.size()).toBe(1);

  const second = await service.resolve('  zona   a ', 'Zona A');
  expect(second.origin).toBe('cache');
  expect(second.failure).toBeNull();
  expect(second.location).toMatchObject({ source: 'provider', latitude: 0, longitude: 0 });
  expect(lookup).toHaveBeenCalledTimes(1);
});

test.each([
  ['null', null],
  ['estado 429', { status: 429 }],
  ['sin coordenadas', { label: 'Incompleta' }],
  ['latitud fuera de rango', { label: 'Inválida', latitude: 91, longitude: 0 }],
  ['latitud como texto', { label: 'Texto', latitude: '0', longitude: 0 }],
  ['NaN', { label: 'NaN', latitude: Number.NaN, longitude: 0 }],
  ['longitud nula', { label: 'Zona ficticia', latitude: 999, longitude: null }],
  ['arreglo', [valid]],
])('respuesta inválida (%s) → manual con contract y sin caché', async (_name, payload) => {
  const cache = createLocationCache();
  const service = createLocationService({ lookup: async () => payload, cache });
  const result = await service.resolve('Zona A', 'Mi referencia');
  expect(result).toEqual({
    location: { source: 'manual', label: 'Mi referencia' },
    origin: 'manual',
    failure: 'contract',
  });
  expect(result.location).not.toHaveProperty('latitude');
  expect(cache.size()).toBe(0);
});

test.each([
  ['timeout', 'timeout'], ['rate_limit', 'rate_limit'], ['server', 'server'],
  ['network', 'network'], ['forbidden', 'forbidden'], ['contract', 'contract'],
  ['not_found', 'unknown'], ['validation', 'unknown'], ['conflict', 'unknown'],
] as const)('IncidentRequestError(%s) → manual con %s; nunca lanza ni cachea', async (kind, failure) => {
  const cache = createLocationCache();
  const service = createLocationService({ lookup: async () => { throw new IncidentRequestError(kind); }, cache });
  await expect(service.resolve('Zona A', 'Zona A')).resolves.toEqual({
    location: { source: 'manual', label: 'Zona A' }, origin: 'manual', failure,
  });
  expect(cache.size()).toBe(0);
});

test('un Error cualquiera → manual con unknown', async () => {
  const service = createLocationService({ lookup: async () => { throw new Error('boom'); } });
  await expect(service.resolve('Zona A', 'Zona A')).resolves.toMatchObject({ origin: 'manual', failure: 'unknown' });
});

test('consulta vacía → manual sin llamar al proveedor', async () => {
  const lookup = jest.fn();
  const service = createLocationService({ lookup });
  for (const query of ['', '   ']) {
    await expect(service.resolve(query, 'Escrita')).resolves.toEqual({
      location: { source: 'manual', label: 'Escrita' }, origin: 'manual', failure: null,
    });
  }
  expect(lookup).not.toHaveBeenCalled();
});

test('manualLabel vacío no inventa nada', async () => {
  const service = createLocationService({ lookup: async () => null });
  const result = await service.resolve('Zona A', '');
  expect(result.location).toEqual({ source: 'manual', label: '' });
});

test('no reintenta: un fallo hace exactamente una llamada', async () => {
  const lookup = jest.fn().mockRejectedValue(new IncidentRequestError('rate_limit', 429, 1));
  const service = createLocationService({ lookup });
  await service.resolve('Zona A', 'Zona A');
  expect(lookup).toHaveBeenCalledTimes(1);
});

test('la observación sólo contiene origin, failure y durationMs', async () => {
  let now = 100;
  const seen: LocationObservation[] = [];
  const service = createLocationService({
    lookup: async () => { now += 40; throw new IncidentRequestError('timeout'); },
    now: () => now,
    onObservation: (observation) => seen.push(observation),
  });
  await service.resolve('Zona secreta', 'Zona secreta');
  expect(seen).toEqual([{ origin: 'manual', failure: 'timeout', durationMs: 40 }]);
  expect(JSON.stringify(seen)).not.toContain('secreta');
  expect(Object.keys(seen[0] as object).sort()).toEqual(['durationMs', 'failure', 'origin']);
});

test('un observador que lanza no rompe el servicio', async () => {
  const service = createLocationService({
    lookup: async () => valid,
    onObservation: () => { throw new Error('observador roto'); },
  });
  await expect(service.resolve('Zona A', 'Zona A')).resolves.toMatchObject({ origin: 'provider' });
});

test('sin caché cada búsqueda llama al proveedor', async () => {
  const lookup = jest.fn().mockResolvedValue(valid);
  const service = createLocationService({ lookup });
  await service.resolve('Zona A', 'Zona A');
  await service.resolve('Zona A', 'Zona A');
  expect(lookup).toHaveBeenCalledTimes(2);
});
