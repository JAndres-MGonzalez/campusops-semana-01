import type { SessionSnapshot, SessionStatus, SessionStorage } from './types';

export interface SessionManagerOptions {
  readonly storage: SessionStorage;
  /** Reloj inyectable: evita `Date.now()` directo y permite probar la expiración. */
  readonly now: () => number;
  /** Base del backend didáctico, p. ej. `http://127.0.0.1:4310`. */
  readonly baseUrl: string;
  /** `fetch` inyectable en pruebas. */
  readonly fetchImpl?: typeof fetch;
  /** Vigencia por defecto cuando el backend no devuelve `expiresInMs`. */
  readonly defaultExpiresInMs?: number;
}

export interface SessionManager {
  login(actorId: string): Promise<void>;
  logout(): Promise<void>;
  /** Devuelve un token vigente (renovando si expiró) o `null` si no hay sesión. */
  getValidToken(): Promise<string | null>;
  status(): SessionStatus;
  snapshot(): SessionSnapshot;
}

interface SessionPayload {
  readonly token: string;
  readonly generation: number;
  readonly expiresInMs: number;
}

const DEFAULT_EXPIRES_IN_MS = 60_000;

function parseSessionPayload(
  input: unknown,
  fallbackGeneration: number,
  fallbackExpiresInMs: number,
): SessionPayload | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const token = record.token;
  if (typeof token !== 'string' || token.length === 0) {
    return null;
  }
  const generation =
    typeof record.generation === 'number' && Number.isFinite(record.generation)
      ? record.generation
      : fallbackGeneration;
  const expiresInMs =
    typeof record.expiresInMs === 'number' && Number.isFinite(record.expiresInMs)
      ? record.expiresInMs
      : fallbackExpiresInMs;
  return { token, generation, expiresInMs };
}

/**
 * Sesión real de la app: login, expiración con reloj inyectable, renovación
 * single-flight y logout con almacenamiento seguro.
 *
 * La política de renovación (una sola renovación por estampida de 401 y retorno
 * seguro a no autenticado al fallar) es la misma que
 * `reduceAuthSignals`, que usa `coordinateRefresh`.
 */
export function createSessionManager(options: SessionManagerOptions): SessionManager {
  const { storage, now, baseUrl } = options;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const defaultExpiresInMs = options.defaultExpiresInMs ?? DEFAULT_EXPIRES_IN_MS;

  let snapshot: SessionSnapshot = {
    token: null,
    generation: 0,
    expiresAt: null,
    status: 'no_autenticado',
  };
  let refreshPromise: Promise<string | null> | null = null;

  const reset = (): void => {
    snapshot = { token: null, generation: 0, expiresAt: null, status: 'no_autenticado' };
  };

  const postJson = async (path: string, body: unknown): Promise<Response> =>
    fetchImpl(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  async function login(actorId: string): Promise<void> {
    snapshot = { ...snapshot, status: 'autenticando' };
    try {
      const response = await postJson('/v1/session/login', { actorId });
      if (!response.ok) {
        throw new Error(`session login failed with status ${response.status}`);
      }
      const payload = parseSessionPayload(
        await response.json(),
        snapshot.generation + 1,
        defaultExpiresInMs,
      );
      if (payload === null) {
        throw new Error('session login returned an invalid payload');
      }
      await storage.write(payload.token);
      snapshot = {
        token: payload.token,
        generation: payload.generation,
        expiresAt: now() + payload.expiresInMs,
        status: 'autenticado',
      };
    } catch (error) {
      await storage.clear();
      reset();
      throw error;
    }
  }

  async function performRefresh(): Promise<string | null> {
    try {
      const response = await postJson('/v1/session/refresh', { generation: snapshot.generation });
      if (!response.ok) {
        await storage.clear();
        reset();
        return null;
      }
      const payload = parseSessionPayload(
        await response.json(),
        snapshot.generation + 1,
        defaultExpiresInMs,
      );
      if (payload === null) {
        await storage.clear();
        reset();
        return null;
      }
      await storage.write(payload.token);
      snapshot = {
        token: payload.token,
        generation: payload.generation,
        expiresAt: now() + payload.expiresInMs,
        status: 'autenticado',
      };
      return payload.token;
    } catch {
      await storage.clear();
      reset();
      return null;
    }
  }

  /** Renovación single-flight: los llamados concurrentes comparten la misma promesa. */
  function refresh(): Promise<string | null> {
    if (refreshPromise !== null) {
      return refreshPromise;
    }
    snapshot = { ...snapshot, status: 'renovando' };
    refreshPromise = performRefresh().finally(() => {
      refreshPromise = null;
    });
    return refreshPromise;
  }

  async function getValidToken(): Promise<string | null> {
    if (snapshot.token === null) {
      reset();
      return null;
    }
    const expiresAt = snapshot.expiresAt;
    if (expiresAt !== null && now() < expiresAt) {
      return snapshot.token;
    }
    snapshot = { ...snapshot, status: 'expirado' };
    return refresh();
  }

  async function logout(): Promise<void> {
    await storage.clear();
    reset();
  }

  return {
    login,
    logout,
    getValidToken,
    status: (): SessionStatus => snapshot.status,
    snapshot: (): SessionSnapshot => snapshot,
  };
}