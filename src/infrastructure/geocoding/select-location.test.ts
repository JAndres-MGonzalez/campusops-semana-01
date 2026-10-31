import { selectIncidentLocationReal } from './select-location';

describe('selectIncidentLocation', () => {
  it('acepta una respuesta completa del proveedor, incluida (0, 0)', () => {
    expect(selectIncidentLocationReal({ label: 'Zona de prueba', latitude: 0, longitude: 0 }, 'Edificio manual'))
      .toEqual({ source: 'provider', label: 'Zona de prueba', latitude: 0, longitude: 0 });
    expect(selectIncidentLocationReal({ label: 'Biblioteca', latitude: 19.4326, longitude: -99.1332 }, 'Edificio'))
      .toEqual({ source: 'provider', label: 'Biblioteca', latitude: 19.4326, longitude: -99.1332 });
  });

  it('cae a la referencia manual ante datos incompletos o inválidos', () => {
    const manual = { source: 'manual', label: 'Edificio manual' };
    const casos: unknown[] = [
      null,
      undefined,
      'Zona de prueba',
      [],
      {},
      { label: 'Incompleta' },
      { label: 'Sin longitud', latitude: 19.4 },
      { label: 'Inválida', latitude: 91, longitude: 0 },
      { label: 'Inválida', latitude: -91, longitude: 0 },
      { label: 'Inválida', latitude: 19.4, longitude: 181 },
      { label: 'Inválida', latitude: Number.NaN, longitude: 0 },
      { label: 'Inválida', latitude: 19.4, longitude: Number.POSITIVE_INFINITY },
      { label: 'Inválida', latitude: '19.4', longitude: '-99.1' },
      { label: '   ', latitude: 19.4, longitude: -99.1 },
      { status: 429 },
      { status: 500, label: 'Zona de prueba', latitude: 19.4, longitude: -99.1 },
    ];
    for (const caso of casos) {
      expect(selectIncidentLocationReal(caso, 'Edificio manual')).toEqual(manual);
    }
  });

  it('no inventa coordenadas cuando el proveedor falla', () => {
    const resultado = selectIncidentLocationReal({ status: 429 }, 'Sótano del edificio B');
    expect(resultado.source).toBe('manual');
    expect(resultado).not.toHaveProperty('latitude');
    expect(resultado).not.toHaveProperty('longitude');
  });
});
