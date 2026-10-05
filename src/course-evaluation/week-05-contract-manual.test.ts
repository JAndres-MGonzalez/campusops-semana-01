import { parseRemoteResource } from './index';

describe('week-05 contract manual', () => {
  const valid = { id: 'campus-inc-001', version: 1, status: 'assigned', payload: { category: 'connectivity' } };

  test('nominal: sobre válido', () => {
    expect(parseRemoteResource(valid)).toEqual({ ok: true, value: valid });
  });

  test('boundary: payload null es válido', () => {
    expect(parseRemoteResource({ ...valid, payload: null }))
      .toEqual({ ok: true, value: { ...valid, payload: null } });
  });

  test('boundary: campos futuros se ignoran', () => {
    const result = parseRemoteResource({ ...valid, ignored: 'forward-compatible' });
    expect(result).toEqual({ ok: true, value: valid });
  });

  test('boundary: id vacío se rechaza', () => {
    expect(parseRemoteResource({ ...valid, id: '' })).toEqual({ ok: false, error: 'contract' });
  });

  test('boundary: version no entera / negativa se rechaza', () => {
    expect(parseRemoteResource({ ...valid, version: '3' }).ok).toBe(false);
    expect(parseRemoteResource({ ...valid, version: -1 }).ok).toBe(false);
    expect(parseRemoteResource({ ...valid, version: 1.5 }).ok).toBe(false);
  });

  test('boundary: status vacío se rechaza', () => {
    expect(parseRemoteResource({ ...valid, status: '' }).ok).toBe(false);
  });

  test('boundary: payload con tipos incorrectos se rechaza', () => {
    expect(parseRemoteResource({ ...valid, payload: [] }).ok).toBe(false);
    expect(parseRemoteResource({ ...valid, payload: '' }).ok).toBe(false);
  });

  test('boundary: entradas no objetos se rechazan', () => {
    expect(parseRemoteResource(null).ok).toBe(false);
    expect(parseRemoteResource('x').ok).toBe(false);
    expect(parseRemoteResource(42).ok).toBe(false);
  });

  test('separación DTO->dominio: el payload null no inventa datos', () => {
    const result = parseRemoteResource({ ...valid, payload: null });
    if (result.ok) {
      expect(result.value.payload).toBeNull();
      expect('category' in result.value).toBe(false);
      expect(result.value.status).toBe('assigned');
    }
  });
});
