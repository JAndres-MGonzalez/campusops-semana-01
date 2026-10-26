export type JsonObject = Readonly<Record<string, unknown>>;

export type SyncRecord = Readonly<{ id: string; version: number; fields: JsonObject }>;

function isEqualJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getValue(fields: JsonObject, key: string): { has: boolean; value: unknown } {
  if (Object.prototype.hasOwnProperty.call(fields, key)) {
    return { has: true, value: (fields as Record<string, unknown>)[key] };
  }
  return { has: false, value: undefined };
}

export function resolveSyncReal(
  base: SyncRecord,
  local: SyncRecord,
  remote: SyncRecord,
): Readonly<{ kind: 'merged'; fields: JsonObject } | { kind: 'conflict'; fields: readonly string[] }> {
  const baseFields = (base.fields ?? {}) as JsonObject;
  const localFields = (local.fields ?? {}) as JsonObject;
  const remoteFields = (remote.fields ?? {}) as JsonObject;

  const allKeysSet = new Set<string>();
  Object.keys(baseFields).forEach((k) => allKeysSet.add(k));
  Object.keys(localFields).forEach((k) => allKeysSet.add(k));
  Object.keys(remoteFields).forEach((k) => allKeysSet.add(k));

  const sortedKeys = Array.from(allKeysSet).sort((a, b) => a.localeCompare(b));

  const localChanged = new Set<string>();
  const remoteChanged = new Set<string>();

  for (const key of sortedKeys) {
    const baseVal = getValue(baseFields, key).value;
    const localVal = getValue(localFields, key).value;
    const remoteVal = getValue(remoteFields, key).value;

    if (!isEqualJson(localVal, baseVal)) {
      localChanged.add(key);
    }
    if (!isEqualJson(remoteVal, baseVal)) {
      remoteChanged.add(key);
    }
  }

  const conflictSet = new Set<string>();
  for (const key of sortedKeys) {
    if (localChanged.has(key) && remoteChanged.has(key)) {
      const localVal = getValue(localFields, key).value;
      const remoteVal = getValue(remoteFields, key).value;
      if (!isEqualJson(localVal, remoteVal)) {
        conflictSet.add(key);
      }
    }
  }

  if (conflictSet.size > 0) {
    const conflictFields = Array.from(conflictSet).sort((a, b) => a.localeCompare(b));
    return { kind: 'conflict', fields: conflictFields };
  }

  const merged: Record<string, unknown> = {};
  for (const key of sortedKeys) {
    if (localChanged.has(key) && !remoteChanged.has(key)) {
      merged[key] = getValue(localFields, key).value;
    } else if (remoteChanged.has(key) && !localChanged.has(key)) {
      merged[key] = getValue(remoteFields, key).value;
    } else if (localChanged.has(key) && remoteChanged.has(key)) {
      // Same change or same value
      merged[key] = getValue(localFields, key).value;
    } else {
      // No changes
      if (getValue(baseFields, key).has) {
        merged[key] = getValue(baseFields, key).value;
      } else if (getValue(localFields, key).has) {
        merged[key] = getValue(localFields, key).value;
      } else if (getValue(remoteFields, key).has) {
        merged[key] = getValue(remoteFields, key).value;
      }
    }
  }

  return { kind: 'merged', fields: merged };
}
