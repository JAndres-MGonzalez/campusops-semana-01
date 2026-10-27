/**
 * Comparación por contenido JSON en la resolución de conflictos (Semana 8).
 * El orden de las propiedades no debe producir un conflicto; el orden de los
 * arreglos sí es contenido.
 */

import { canonicalJson, isEqualJson } from './canonical-json';
import { resolveSyncReal } from './resolve';

describe('canonicalJson', () => {
  it('produce la misma cadena para objetos con distinto orden de claves', () => {
    expect(canonicalJson({ a: 1, b: { y: 2, x: 1 } }))
      .toBe(canonicalJson({ b: { x: 1, y: 2 }, a: 1 }));
    expect(isEqualJson({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  it('distingue valores y orden de arreglos', () => {
    expect(isEqualJson(['a', 'b'], ['b', 'a'])).toBe(false);
    expect(isEqualJson({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe('resolveSync: contenido frente a orden de propiedades', () => {
  it('no marca conflicto cuando sólo cambia el orden de las propiedades', () => {
    const base = {
      id: 'campus-inc-001',
      version: 1,
      fields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } },
    };
    const local = {
      ...base,
      fields: { work: { status: 'assigned', assignedTechnicianId: 'technician-1' } },
    };
    const remote = { ...base, version: 2 };

    const result = resolveSyncReal(base, local, remote);

    expect(result.kind).toBe('merged');
    if (result.kind === 'merged') {
      expect(result.fields).toEqual({
        work: { assignedTechnicianId: 'technician-1', status: 'assigned' },
      });
    }
  });

  it('toma el cambio remoto si local sólo reordenó y remoto sí cambió el valor', () => {
    const base = {
      id: 'campus-inc-001',
      version: 1,
      fields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } },
    };
    const local = {
      ...base,
      fields: { work: { status: 'assigned', assignedTechnicianId: 'technician-1' } },
    };
    const remote = {
      ...base,
      version: 2,
      fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } },
    };

    const result = resolveSyncReal(base, local, remote);

    expect(result).toEqual({
      kind: 'merged',
      fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } },
    });
  });

  it('sigue declarando conflicto cuando el contenido realmente difiere', () => {
    const base = {
      id: 'campus-inc-001',
      version: 1,
      fields: { work: { assignedTechnicianId: 'technician-1', status: 'assigned' } },
    };
    const local = {
      ...base,
      fields: { work: { status: 'in_progress', assignedTechnicianId: 'technician-1' } },
    };
    const remote = {
      ...base,
      version: 2,
      fields: { work: { assignedTechnicianId: 'technician-2', status: 'assigned' } },
    };

    expect(resolveSyncReal(base, local, remote)).toEqual({ kind: 'conflict', fields: ['work'] });
  });

  it('el orden de un arreglo sí cuenta como cambio de contenido', () => {
    const base = { id: 'campus-inc-001', version: 1, fields: { tags: ['a', 'b'] } };
    const local = { ...base, fields: { tags: ['b', 'a'] } };
    const remote = { ...base, version: 2, fields: { tags: ['a', 'c'] } };

    expect(resolveSyncReal(base, local, remote)).toEqual({ kind: 'conflict', fields: ['tags'] });
  });
});
