/**
 * Abstracción de almacenamiento persistente (Semana 8).
 * Usa @react-native-async-storage/async-storage como almacenamiento DURADERO
 * para que la cola e incidencias sobrevivan al cerrar y abrir la app.
 * Se mantiene un fallback en memoria únicamente para entornos sin AsyncStorage.
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

function createDefaultStorage(): PersistenceStorage {
  try {
    // Preferir almacenamiento DURADERO para demostrar persistencia al reiniciar
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const asyncStorageModule = require('@react-native-async-storage/async-storage');
    const asyncStorage = asyncStorageModule?.default ?? asyncStorageModule;

    if (asyncStorage && typeof asyncStorage.getItem === 'function') {
      return {
        getItem: (key: string) => asyncStorage.getItem(key),
        setItem: (key: string, value: string) => asyncStorage.setItem(key, value),
        removeItem: (key: string) => asyncStorage.removeItem(key),
        clear: () => asyncStorage.clear(),
      };
    }
  } catch {
    // Si no está disponible, usar fallback (principalmente para pruebas)
  }
  return new MemoryStorage();
}

export const storage: PersistenceStorage = createDefaultStorage();

export function createMemoryStorage(): PersistenceStorage {
  return new MemoryStorage();
}

export function createDurableStorage(): PersistenceStorage {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const asyncStorageModule = require('@react-native-async-storage/async-storage');
    const asyncStorage = asyncStorageModule?.default ?? asyncStorageModule;

    if (asyncStorage && typeof asyncStorage.getItem === 'function') {
      return {
        getItem: (key: string) => asyncStorage.getItem(key),
        setItem: (key: string, value: string) => asyncStorage.setItem(key, value),
        removeItem: (key: string) => asyncStorage.removeItem(key),
        clear: () => asyncStorage.clear(),
      };
    }
  } catch {
    // Ignorar y dejar que quien llame decida el fallback
  }
  return new MemoryStorage();
}
