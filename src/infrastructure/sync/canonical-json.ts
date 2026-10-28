/**
 * Igualdad por contenido JSON (Semana 8).
 *
 * El orden de las propiedades no forma parte del contenido: dos objetos con las
 * mismas propiedades y valores son iguales aunque se hayan serializado en otro
 * orden. Los arreglos sí son ordenados (su orden es contenido).
 *
 * `resolveSync` usa esta comparación para decidir si un campo cambió, de modo
 * que reordenar claves no se reporta como conflicto.
 */

function sortObjectKeys(_key: string, value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    // Deja que JSON.stringify use toJSON() en tipos especiales (p. ej. Date).
    return value;
  }
  const record = value as Record<string, unknown>;
  return Object.keys(record)
    .sort()
    .reduce<Record<string, unknown>>((sorted, key) => {
      sorted[key] = record[key];
      return sorted;
    }, {});
}

/** Serialización estable: mismas propiedades ⇒ misma cadena. */
export function canonicalJson(value: unknown): string | undefined {
  return JSON.stringify(value, sortObjectKeys);
}

export function isEqualJson(a: unknown, b: unknown): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
