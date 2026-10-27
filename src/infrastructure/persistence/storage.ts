/**
 * Abstracción de almacenamiento persistente (Semana 8).
 * Usa @react-native-async-storage/async-storage como almacenamiento DURADERO
 * para que la cola e incidencias sobrevivan al cerrar y abrir la app.
 * Se mantiene un fallback en memoria únicamente para entornos sin AsyncStorage
 * (por ejemplo Jest, donde el módulo nativo no existe y se sustituye por el
 * mock oficial desde jest.setup.js).
 */

export interface PersistenceStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
}

class MemoryStorage implements PersistenceStorage {
  private store = new Map<string, string>();

  async getItem(key: string): Promise<string | null> {
    const value = this.store.get(key);
    return value === undefined ? null : value;
  }

  async setItem(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }

  async removeItem(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }
}

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
};

function resolveAsyncStorage(): AsyncStorageLike | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const asyncStorageModule = require('@react-native-async-storage/async-storage');
    const asyncStorage: unknown = asyncStorageModule?.default ?? asyncStorageModule;

    if (
      asyncStorage !== null
      && typeof asyncStorage === 'object'
      && typeof (asyncStorage as AsyncStorageLike).getItem === 'function'
    ) {
      return asyncStorage as AsyncStorageLike;
    }
  } catch {
    // Entorno sin el módulo (Node, pruebas sin sustituto): se usa memoria.
  }
  return null;
}

/**
 * Almacenamiento duradero (AsyncStorage) con respaldo en memoria.
 * Es la única fábrica que decide el medio: la cola y las migraciones sólo
 * hablan con el puerto `PersistenceStorage`.
 */
export function createDurableStorage(): PersistenceStorage {
  const asyncStorage = resolveAsyncStorage();
  if (asyncStorage === null) {
    return new MemoryStorage();
  }
  return {
    getItem: (key: string) => asyncStorage.getItem(key),
    setItem: (key: string, value: string) => asyncStorage.setItem(key, value),
    removeItem: (key: string) => asyncStorage.removeItem(key),
    clear: () => asyncStorage.clear(),
  };
}

export function createMemoryStorage(): PersistenceStorage {
  return new MemoryStorage();
}

export const storage: PersistenceStorage = createDurableStorage();
