import { createMemorySessionStorage } from './memory-storage';
import { createSessionManager } from './manager';
import type { SessionStorage } from './types';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('login guarda el token en almacenamiento seguro y queda autenticado', async () => {
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({
    storage,
    now: () => 1_000,
    baseUrl: 'http://127.0.0.1:4310',
    fetchImpl: async () =>
      jsonResponse({ token: 'course-valid-token', generation: 1, expiresInMs: 60_000 }),
  });

  await manager.login('technician-1');

  expect(manager.status()).toBe('autenticado');
  expect(await storage.read()).toBe('course-valid-token');
});

test('expiración con reloj inyectable: renueva sin esperas reales', async () => {
  let clock = 1_000;
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({
    storage,
    now: () => clock,
    baseUrl: 'http://127.0.0.1:4310',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/session/refresh')) {
        return jsonResponse({ token: 'course-token-2', generation: 2, expiresInMs: 60_000 });
      }
      return jsonResponse({ token: 'course-token-1', generation: 1, expiresInMs: 60_000 });
    },
  });

  await manager.login('technician-1');
  clock += 120_000; // el token caducó, sin `sleep` real

  expect(await manager.getValidToken()).toBe('course-token-2');
  expect(await storage.read()).toBe('course-token-2');
});

test('renovación single-flight: llamadas concurrentes comparten una sola renovación', async () => {
  let clock = 1_000;
  let refreshCalls = 0;
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({
    storage,
    now: () => clock,
    baseUrl: 'http://127.0.0.1:4310',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/session/refresh')) {
        refreshCalls += 1;
        return jsonResponse({ token: 'course-token-2', generation: 2, expiresInMs: 60_000 });
      }
      return jsonResponse({ token: 'course-token-1', generation: 1, expiresInMs: 60_000 });
    },
  });

  await manager.login('technician-1');
  clock += 120_000;
  const tokens = await Promise.all([
    manager.getValidToken(),
    manager.getValidToken(),
    manager.getValidToken(),
  ]);

  expect(refreshCalls).toBe(1);
  expect(tokens).toEqual(['course-token-2', 'course-token-2', 'course-token-2']);
});

test('refresh fallido vuelve de forma segura a no autenticado y olvida el token', async () => {
  let clock = 1_000;
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({
    storage,
    now: () => clock,
    baseUrl: 'http://127.0.0.1:4310',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/session/refresh')) {
        return jsonResponse({ error: 'expired' }, 401);
      }
      return jsonResponse({ token: 'course-token-1', generation: 1, expiresInMs: 60_000 });
    },
  });

  await manager.login('technician-1');
  clock += 120_000;

  expect(await manager.getValidToken()).toBeNull();
  expect(manager.status()).toBe('no_autenticado');
  expect(await storage.read()).toBeNull();
});

test('renew fuerza una renovación single-flight aun sin expirar (rechazo del servidor)', async () => {
  let clock = 1_000;
  let refreshCalls = 0;
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({
    storage,
    now: () => clock,
    baseUrl: 'http://127.0.0.1:4310',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/session/refresh')) {
        refreshCalls += 1;
        return jsonResponse({ token: 'course-token-2', generation: 2, expiresInMs: 60_000 });
      }
      return jsonResponse({ token: 'course-token-1', generation: 1, expiresInMs: 60_000 });
    },
  });

  await manager.login('technician-1');
  // El reloj no avanzó (el token estaría vigente), pero el servidor lo rechazó:
  // `renew` fuerza la renovación y comparte una sola llamada HTTP.
  const tokens = await Promise.all([
    manager.renew(),
    manager.renew(),
    manager.renew(),
  ]);

  expect(refreshCalls).toBe(1);
  expect(tokens).toEqual(['course-token-2', 'course-token-2', 'course-token-2']);
  expect(await storage.read()).toBe('course-token-2');
});

test('401 de generación anterior reutiliza el token renovado sin abrir otra renovación', async () => {
  let refreshCalls = 0;
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({
    storage,
    now: () => 1_000,
    baseUrl: 'http://127.0.0.1:4310',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/session/refresh')) {
        refreshCalls += 1;
        return jsonResponse({ token: 'course-token-2', generation: 2, expiresInMs: 60_000 });
      }
      return jsonResponse({ token: 'course-token-1', generation: 1, expiresInMs: 60_000 });
    },
  });

  await manager.login('technician-1');
  // La primera solicitud recibe 401 del token viejo (course-token-1) y renueva.
  expect(await manager.renew('course-token-1')).toBe('course-token-2');
  expect(refreshCalls).toBe(1);
  // El 401 de la segunda solicitud llega DESPUÉS de la renovación y sigue
  // referido al token anterior: debe usar el token ya actualizado sin abrir
  // otra renovación (caso de generación anterior de la guía).
  expect(await manager.renew('course-token-1')).toBe('course-token-2');
  expect(refreshCalls).toBe(1);
  expect(await storage.read()).toBe('course-token-2');
});

test('logout durante la escritura del token renovado invalida esa escritura', async () => {
  let clock = 1_000;
  let releaseRefreshWrite!: () => void;
  let noteRefreshWriteStarted!: () => void;
  const refreshWriteStarted = new Promise<void>((resolve) => { noteRefreshWriteStarted = resolve; });
  let persisted: string | null = null;
  const storage: SessionStorage = {
    read: async () => persisted,
    write: async (token: string) => {
      if (token === 'course-token-2') {
        noteRefreshWriteStarted();
        await new Promise<void>((resolve) => { releaseRefreshWrite = resolve; });
      }
      persisted = token;
    },
    clear: async () => { persisted = null; },
  };
  const manager = createSessionManager({
    storage,
    now: () => clock,
    baseUrl: 'http://127.0.0.1:4310',
    fetchImpl: async (input) => {
      const url = String(input);
      if (url.endsWith('/v1/session/refresh')) {
        return jsonResponse({ token: 'course-token-2', generation: 2, expiresInMs: 60_000 });
      }
      return jsonResponse({ token: 'course-token-1', generation: 1, expiresInMs: 60_000 });
    },
  });

  await manager.login('technician-1');
  clock += 120_000;
  const pending = manager.getValidToken();
  // Espera a que la escritura del token renovado haya comenzado, entonces
  // ocurre el logout mientras esa escritura sigue pendiente.
  await refreshWriteStarted;
  await manager.logout();
  releaseRefreshWrite();
  const token = await pending;

  expect(token).toBeNull();
  expect(manager.status()).toBe('no_autenticado');
  expect(await storage.read()).toBeNull();
});

test('logout borra el estado persistido', async () => {
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({
    storage,
    now: () => 1_000,
    baseUrl: 'http://127.0.0.1:4310',
    fetchImpl: async () =>
      jsonResponse({ token: 'course-token-1', generation: 1, expiresInMs: 60_000 }),
  });

  await manager.login('technician-1');
  await manager.logout();

  expect(manager.status()).toBe('no_autenticado');
  expect(await storage.read()).toBeNull();
});