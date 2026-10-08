import { createMemorySessionStorage } from './memory-storage';
import { createSessionManager } from './manager';

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