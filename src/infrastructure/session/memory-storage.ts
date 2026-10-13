import type { SessionStorage } from './types';

/**
 * Almacenamiento en memoria para pruebas: no toca el dispositivo ni importa
 * `expo-secure-store`, por lo que Jest no necesita transformar el módulo nativo.
 */
export function createMemorySessionStorage(initial: string | null = null): SessionStorage {
  let current = initial;
  return {
    async read(): Promise<string | null> {
      return current;
    },
    async write(token: string): Promise<void> {
      current = token;
    },
    async clear(): Promise<void> {
      current = null;
    },
  };
}