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
  readonly refreshToken: string | null;
  readonly generation: number;
  readonly expiresInMs: number;
}

const DEFAULT_EXPIRES_IN_MS = 60_000;

/**
 * Acepta el formato didáctico del módulo ({ token, generation, expiresInMs })
 * y el contrato real del backend didáctico ({ accessToken, refreshToken,
 * expiresIn }, con `expiresIn` en segundos), para que el manager funcione
 * contra ambos sin conversiones en la capa de la app.
 */
function parseSessionPayload(
  input: unknown,
  fallbackGeneration: number,
  fallbackExpiresInMs: number,
): SessionPayload | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  const record = input as Record<string, unknown>;
  const token =
    typeof record.token === 'string'
      ? record.token
      : typeof record.accessToken === 'string'
        ? record.accessToken
        : null;
  if (token === null || token.length === 0) {
    return null;
  }
  const refreshToken =
    typeof record.refreshToken === 'string' && record.refreshToken.length > 0
      ? record.refreshToken
      : null;
  const generation =
    typeof record.generation === 'number' && Number.isFinite(record.generation)
      ? record.generation
      : fallbackGeneration;
  const expiresInMs =
    typeof record.expiresInMs === 'number' && Number.isFinite(record.expiresInMs)
      ? record.expiresInMs
      : typeof record.expiresIn === 'number' && Number.isFinite(record.expiresIn) && record.expiresIn > 0
        ? Math.round(record.expiresIn * 1000)
        : fallbackExpiresInMs;
  return { token, refreshToken, generation, expiresInMs };
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
    refreshToken: null,
    generation: 0,
    expiresAt: null,
    status: 'no_autenticado',
  };
  let refreshPromise: Promise<string | null> | null = null;
  /** Incrementa en cada reset: permite descartar una renovación que terminó después de un logout. */
  let sessionEpoch = 0;

  const reset = (): void => {
    sessionEpoch += 1;
    snapshot = {
      token: null,
      refreshToken: null,
      generation: 0,
      expiresAt: null,
      status: 'no_autenticado',
    };
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
        refreshToken: payload.refreshToken,
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
    const epoch = sessionEpoch;
    try {
      const response = await postJson('/v1/session/refresh', { refreshToken: snapshot.refreshToken });
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
      // Si hubo logout mientras la renovación estaba pendiente, se descarta la
      // respuesta: no se vuelve a guardar una sesión que ya se cerró.
      if (sessionEpoch !== epoch) {
        return null;
      }
      await storage.write(payload.token);
      snapshot = {
        token: payload.token,
        refreshToken: payload.refreshToken,
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
    snapshot = { ...snapshot, status: 'renovando' };
    if (refreshPromise !== null) {
      return refreshPromise;
    }
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