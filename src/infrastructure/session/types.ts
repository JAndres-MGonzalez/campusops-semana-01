/**
 * Tipos del módulo de sesión (semana 6).
 *
 * `SessionStatus` documenta el ciclo de vida observable de la sesión y es el
 * conjunto de estados que debe reflejar `docs/session-state-machine.mmd`.
 */
export type SessionStatus =
  | 'no_autenticado'
  | 'autenticando'
  | 'autenticado'
  | 'expirado'
  | 'renovando';

/**
 * Persistencia del token. La implementación de producción usa
 * `expo-secure-store`; las pruebas inyectan una versión en memoria para no
 * tocar el dispositivo.
 */
export interface SessionStorage {
  read(): Promise<string | null>;
  write(token: string): Promise<void>;
  clear(): Promise<void>;
}

export interface SessionSnapshot {
  readonly token: string | null;
  readonly generation: number;
  readonly expiresAt: number | null;
  readonly status: SessionStatus;
}