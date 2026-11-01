import type { IncidentLocation } from '../../campusops/contracts';
import { createLocationCache, normalizeLocationQuery } from './cache';

const edificio: IncidentLocation = { source: 'provider', label: 'Edificio de prueba A', latitude: 0, longitude: 0 };

test('acierto inmediato y fallo para claves ausentes', () => {
  const cache = createLocationCache();
  cache.set('Zona A', edificio);
  expect(cache.get('Zona A')).toEqual(edificio);
  expect(cache.get('Zona B')).toBeUndefined();
  expect(cache.size()).toBe(1);
});

test('la entrada expira con el reloj inyectado y se elimina', () => {
  let now = 1_000;
  const cache = createLocationCache({ ttlMs: 100, now: () => now });
  cache.set('Zona A', edificio);
  now = 1_099;
  expect(cache.get('Zona A')).toEqual(edificio);
  now = 1_100;
  expect(cache.get('Zona A')).toBeUndefined();
  expect(cache.size()).toBe(0);
});

test('con maxEntries se desaloja la entrada más antigua (FIFO)', () => {
  const cache = createLocationCache({ maxEntries: 2 });
  cache.set('uno', edificio);
  cache.set('dos', edificio);
  cache.set('tres', edificio);
  expect(cache.size()).toBe(2);
  expect(cache.get('uno')).toBeUndefined();
  expect(cache.get('dos')).toEqual(edificio);
  expect(cache.get('tres')).toEqual(edificio);
});

test('actualizar una clave existente no desaloja a otra', () => {
  const cache = createLocationCache({ maxEntries: 2 });
  cache.set('uno', edificio);
  cache.set('dos', edificio);
  cache.set('uno', { ...edificio, label: 'Otro' });
  expect(cache.size()).toBe(2);
  expect(cache.get('dos')).toEqual(edificio);
  expect(cache.get('uno')?.label).toBe('Otro');
});

test('claves equivalentes comparten entrada', () => {
  const cache = createLocationCache();
  cache.set(' Edificio  A ', edificio);
  expect(cache.get('edificio a')).toEqual(edificio);
  expect(cache.get('EDIFICIO   A')).toEqual(edificio);
  expect(normalizeLocationQuery('  Edificio \t A ')).toBe('edificio a');
  expect(cache.size()).toBe(1);
});

test('devuelve un objeto congelado y no comparte el original', () => {
  const cache = createLocationCache();
  const original = { ...edificio };
  cache.set('Zona A', original);
  (original as { label: string }).label = 'mutado';
  const stored = cache.get('Zona A');
  expect(stored?.label).toBe('Edificio de prueba A');
  expect(Object.isFrozen(stored)).toBe(true);
});

test('clear vacía la caché', () => {
  const cache = createLocationCache();
  cache.set('Zona A', edificio);
  cache.clear();
  expect(cache.size()).toBe(0);
  expect(cache.get('Zona A')).toBeUndefined();
});
