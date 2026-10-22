/**
 * Abstracción de almacenamiento persistente (Semana 8).
 * Usa AsyncStorage si está disponible, de lo contrario un almacenamiento en memoria
 * con persistencia simulada. Lo importante es que la cola sea persistente y
 * sobreviva a un reinicio simulado.
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
    // Try to use AsyncStorage if available (React Native)
    const asyncStorage = require('@react-native-async-storage/async-storage');
    if (asyncStorage?.default) {
      return {
        getItem: (key: string) => asyncStorage.default.getItem(key),
        setItem: (key: string, value: string) => asyncStorage.default.setItem(key, value),
        removeItem: (key: string) => asyncStorage.default.removeItem(key),
        clear: () => asyncStorage.default.clear(),
      };
    }
    if (typeof asyncStorage.getItem === 'function') {
      return asyncStorage as PersistenceStorage;
    }
  } catch {
    // Fallback to memory storage
  }
  return new MemoryStorage();
}

export const storage: PersistenceStorage = createDefaultStorage();

export function createMemoryStorage(): PersistenceStorage {
  return new MemoryStorage();
}
