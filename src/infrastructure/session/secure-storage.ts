import * as SecureStore from 'expo-secure-store';

import type { SessionStorage } from './types';

const TOKEN_KEY = 'campusops.session.token';

/**
 * Persistencia segura del token en producción (Keychain en iOS / Keystore en
 * Android). El token nunca se escribe en `AsyncStorage` plano ni en logs.
 */
export function createSecureSessionStorage(): SessionStorage {
  return {
    async read(): Promise<string | null> {
      return SecureStore.getItemAsync(TOKEN_KEY);
    },
    async write(token: string): Promise<void> {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
    },
    async clear(): Promise<void> {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    },
  };
}