/** @jest-environment node */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { coordinateRefresh, redactForTelemetry } from '../../src/course-evaluation';
import { createSessionManager } from '../../src/infrastructure/session/manager';
import { createMemorySessionStorage } from '../../src/infrastructure/session/memory-storage';
import { HttpIncidentRepository } from '../../src/infrastructure/incidents/http-incident-repository';
import { fetchFromLocalBackend } from '../week-05/backend-transport';

const command = 'npm.cmd test -- --ci --runInBand evidence/week-06/concurrency.test.ts';
const observations: { id: string; scenarioType: string; expected: unknown; observed: unknown; status: string }[] = [];
let backend: ChildProcess;
let baseUrl: string;

function response(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, json: async () => body } as unknown as Response;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function check(id: string, scenarioType: string, expected: unknown, observed: unknown) {
  observations.push({ id, scenarioType, expected, observed,
    status: JSON.stringify(expected) === JSON.stringify(observed) ? 'pass' : 'fail' });
  expect(observed).toEqual(expected);
}

beforeAll(async () => {
  backend = spawn(process.execPath, ['course-backend/server.mjs'], {
    env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  baseUrl = await new Promise<string>((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Backend local no disponible')), 5000);
    backend.stdout?.on('data', (chunk: Buffer) => {
      output += chunk.toString();
      const address = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (address) { clearTimeout(timer); resolve(address[0]); }
    });
    backend.once('error', (error) => { clearTimeout(timer); reject(error); });
    backend.once('exit', () => { clearTimeout(timer); reject(new Error('Backend finalizó antes del inicio')); });
  });
});

afterAll(async () => {
  const logs = join(process.cwd(), 'evidence/week-06/logs');
  const reports = join(process.cwd(), 'reports/week-06');
  mkdirSync(logs, { recursive: true });
  mkdirSync(reports, { recursive: true });
  const metadata = { schemaVersion: 1, week: 6,
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    generatedAt: new Date().toISOString() };
  writeFileSync(join(logs, 'concurrency-observations.json'),
    JSON.stringify(redactForTelemetry({ ...metadata, observations }), null, 2) + '\n');
  writeFileSync(join(reports, 'concurrency.json'), JSON.stringify({ ...metadata,
    checks: observations.map(({ id, status, scenarioType, expected, observed }) => ({
      id, status, scenarioType, command,
      evidence: `Esperado: ${JSON.stringify(expected)}. Observado: ${JSON.stringify(observed)}. evidence/week-06/logs/concurrency-observations.json`,
    })),
  }, null, 2) + '\n');
  if (backend && backend.exitCode === null) {
    await new Promise<void>((resolve) => { backend.once('exit', () => resolve()); backend.kill(); });
  }
});

test('cuatro respuestas 401 comparten una renovación', () => {
  const summary = coordinateRefresh([
    ...['a', 'b', 'c', 'd'].map((requestId) => ({ type: 'request401' as const, requestId, generation: 0 })),
    { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
  ]);
  check('concurrency-shared-refresh', 'nominal', { refreshCalls: 1, retriedRequestIds: ['a', 'b', 'c', 'd'] },
    { refreshCalls: summary.refreshCalls, retriedRequestIds: summary.retriedRequestIds });
});

test('un 401 de generación anterior no abre otra renovación', () => {
  const summary = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
    { type: 'request401', requestId: 'a', generation: 0 },
  ]);
  check('concurrency-limited-refresh', 'boundary', { refreshCalls: 1 }, { refreshCalls: summary.refreshCalls });
});

test('cada solicitud se registra para reintentar solo una vez', () => {
  const summary = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
    { type: 'request401', requestId: 'a', generation: 0 },
  ]);
  check('concurrency-limited-retries', 'boundary', { retriedRequestIds: ['a'] },
    { retriedRequestIds: summary.retriedRequestIds });
});

test('logout normal elimina la sesión persistida', () => {
  const summary = coordinateRefresh([
    { type: 'request401', requestId: 'a', generation: 0 },
    { type: 'refreshSucceeded', generation: 1, token: 'course-token-1' },
    { type: 'logout' },
  ]);
  check('concurrency-logout-clears-session', 'nominal', { status: 'anonymous', persistedSessionPresent: false },
    { status: summary.status, persistedSessionPresent: summary.persistedToken !== null });
});

test('el manager comparte una renovación pendiente con reloj controlable', async () => {
  let clock = 1000;
  let refreshCalls = 0;
  const gate = deferred<Response>();
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({ storage, now: () => clock, baseUrl,
    fetchImpl: async (input) => {
      if (String(input).endsWith('/refresh')) { refreshCalls++; return gate.promise; }
      return response({ token: 'course-token-1', generation: 1, expiresInMs: 1000 });
    },
  });
  await manager.login('reporter-1');
  clock = 2000;
  const waiting = [manager.getValidToken(), manager.getValidToken(), manager.getValidToken(), manager.getValidToken()];
  const pendingStatus = manager.status();
  gate.resolve(response({ token: 'course-token-2', generation: 2, expiresInMs: 1000 }));
  const values = await Promise.all(waiting);
  check('concurrency-manager-single-flight', 'boundary',
    { refreshCalls: 1, pendingStatus: 'renovando', sameResult: true, status: 'autenticado' },
    { refreshCalls, pendingStatus, sameResult: values[0] !== null && values.every((value) => value === values[0]), status: manager.status() });
});

test('un refresh fallido elimina la sesión y no entra en un bucle', async () => {
  let clock = 1000;
  let refreshCalls = 0;
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({ storage, now: () => clock, baseUrl,
    fetchImpl: async (input) => {
      if (String(input).endsWith('/refresh')) { refreshCalls++; return response({ code: 'invalid_grant' }, 401); }
      return response({ token: 'course-token-1', generation: 1, expiresInMs: 1000 });
    },
  });
  await manager.login('reporter-1');
  clock = 2000;
  await manager.getValidToken();
  await manager.getValidToken();
  check('concurrency-refresh-failure', 'failure',
    { refreshCalls: 1, status: 'no_autenticado', persistedSessionPresent: false },
    { refreshCalls, status: manager.status(), persistedSessionPresent: await storage.read() !== null });
});

test('una renovación pendiente no restaura la sesión después del logout', async () => {
  let clock = 1000;
  const gate = deferred<Response>();
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({ storage, now: () => clock, baseUrl,
    fetchImpl: async (input) => String(input).endsWith('/refresh') ? gate.promise
      : response({ token: 'course-token-1', generation: 1, expiresInMs: 1000 }),
  });
  await manager.login('reporter-1');
  clock = 2000;
  const waiting = manager.getValidToken();
  await manager.logout();
  gate.resolve(response({ token: 'course-token-2', generation: 2, expiresInMs: 1000 }));
  await waiting;
  check('concurrency-logout-during-refresh', 'failure',
    { status: 'no_autenticado', persistedSessionPresent: false },
    { status: manager.status(), persistedSessionPresent: await storage.read() !== null });
});

test('el manager acepta el login del backend didáctico real', async () => {
  let httpStatus = 0;
  let responseKeys: string[] = [];
  let loginAccepted = false;
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({ storage, now: () => 1000, baseUrl,
    fetchImpl: async (input, init) => {
      const remote = await fetchFromLocalBackend(input, init);
      const body: unknown = await remote.json();
      httpStatus = remote.status;
      responseKeys = typeof body === 'object' && body !== null ? Object.keys(body).sort() : [];
      return response(body, remote.status);
    },
  });
  try { await manager.login('reporter-1'); loginAccepted = true; } catch { /* Se observa el rechazo sin registrar datos de sesión. */ }
  const observed = { httpStatus, responseKeys, loginAccepted, status: manager.status() };
  check('session-backend-contract', 'failure',
    { httpStatus: 200, responseKeys: ['accessToken', 'actorId', 'expiresIn', 'refreshToken', 'role'], loginAccepted: true, status: 'autenticado' }, observed);
});

test('el contrato real permite renovar una sesión expirada', async () => {
  let clock = 1000;
  let refreshCalls = 0;
  const manager = createSessionManager({ storage: createMemorySessionStorage(), now: () => clock, baseUrl,
    fetchImpl: async (input, init) => {
      if (String(input).endsWith('/refresh')) refreshCalls++;
      return fetchFromLocalBackend(input, init);
    },
  });
  await manager.login('reporter-1');
  clock = 62000;
  const token = await manager.getValidToken();
  check('real-backend-refresh', 'nominal', { refreshCalls: 1, tokenPresent: true, status: 'autenticado' },
    { refreshCalls, tokenPresent: token !== null, status: manager.status() });
});

test('después del logout el cliente no obtiene incidencias con un token de respaldo', async () => {
  const storage = createMemorySessionStorage();
  const manager = createSessionManager({ storage, now: () => 1000, baseUrl, fetchImpl: fetchFromLocalBackend });
  await manager.login('reporter-1');
  const repository = new HttpIncidentRepository(baseUrl, {
    fetchImpl: fetchFromLocalBackend, tokenProvider: () => manager.getValidToken(),
  });
  await manager.logout();
  let protectedRequestSucceeded = false;
  try { await repository.list(); protectedRequestSucceeded = true; } catch { /* Se observa el bloqueo. */ }
  check('logout-blocks-protected-request', 'nominal',
    { status: 'no_autenticado', storedTokenPresent: false, protectedRequestSucceeded: false },
    { status: manager.status(), storedTokenPresent: await storage.read() !== null, protectedRequestSucceeded });
});

test('logout invalida una renovación cuya escritura segura todavía está pendiente', async () => {
  let clock = 1000;
  let storedToken: string | null = null;
  const writeStarted = deferred<void>();
  const writeRelease = deferred<void>();
  const manager = createSessionManager({
    baseUrl, now: () => clock,
    storage: {
      read: async () => storedToken,
      clear: async () => { storedToken = null; },
      write: async (token) => {
        if (token === 'course-token-2') { writeStarted.resolve(); await writeRelease.promise; }
        storedToken = token;
      },
    },
    fetchImpl: async (input) => response({
      token: String(input).endsWith('/refresh') ? 'course-token-2' : 'course-token-1',
      generation: 1, expiresInMs: 1000,
    }),
  });
  await manager.login('reporter-1');
  clock = 2000;
  const pending = manager.getValidToken();
  await writeStarted.promise;
  await manager.logout();
  writeRelease.resolve();
  await pending;
  check('logout-during-pending-storage-write', 'boundary',
    { status: 'no_autenticado', storedTokenPresent: false },
    { status: manager.status(), storedTokenPresent: storedToken !== null });
});

test('cuatro respuestas HTTP 401 comparten una renovación y un reintento por solicitud', async () => {
  let refreshCalls = 0;
  let incidentCalls = 0;
  const manager = createSessionManager({ storage: createMemorySessionStorage(), now: () => 1000, baseUrl,
    fetchImpl: async (input) => {
      const refreshing = String(input).endsWith('/refresh');
      if (refreshing) refreshCalls++;
      return response({ token: refreshing ? 'course-token-2' : 'course-token-1', generation: 1, expiresInMs: 60000 });
    },
  });
  await manager.login('reporter-1');
  const repository = new HttpIncidentRepository(baseUrl, {
    tokenProvider: () => manager.getValidToken(),
    onUnauthorized: (rejectedToken) => manager.renew(rejectedToken),
    fetchImpl: async () => {
      incidentCalls++;
      return incidentCalls <= 4 ? response({ code: 'unauthorized' }, 401) : response({ items: [] });
    },
  });
  const results = await Promise.allSettled(Array.from({ length: 4 }, () => repository.list()));
  check('http-401-shared-refresh', 'nominal', { refreshCalls: 1, incidentCalls: 8, successfulRequests: 4 },
    { refreshCalls, incidentCalls, successfulRequests: results.filter((result) => result.status === 'fulfilled').length });
});

test('un HTTP 401 tardío del token anterior no vuelve a renovar la sesión', async () => {
  let refreshCalls = 0;
  let incidentCalls = 0;
  const late401 = deferred<Response>();
  const manager = createSessionManager({ storage: createMemorySessionStorage(), now: () => 1000, baseUrl,
    fetchImpl: async (input) => {
      if (String(input).endsWith('/refresh')) refreshCalls++;
      return response({ token: `course-token-${refreshCalls + 1}`, generation: refreshCalls + 1, expiresInMs: 60000 });
    },
  });
  await manager.login('reporter-1');
  const repository = new HttpIncidentRepository(baseUrl, {
    tokenProvider: () => manager.getValidToken(),
    onUnauthorized: (rejectedToken) => manager.renew(rejectedToken),
    fetchImpl: async () => {
      incidentCalls++;
      if (incidentCalls === 1) return response({ code: 'unauthorized' }, 401);
      if (incidentCalls === 2) return late401.promise;
      return response({ items: [] });
    },
  });
  const first = repository.list();
  const second = repository.list();
  await first;
  late401.resolve(response({ code: 'unauthorized' }, 401));
  await second;
  check('obsolete-http-401-does-not-renew-again', 'boundary', { refreshCalls: 1, incidentCalls: 4 },
    { refreshCalls, incidentCalls });
});

test('el backend autoriza resolver al técnico y cerrar a coordinación', async () => {
  const login = await fetchFromLocalBackend(`${baseUrl}/v1/session/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actorId: 'technician-1' }),
  });
  const statuses: number[] = [];
  const actions = [
    { action: 'start', actorId: 'technician-1', baseVersion: 1 },
    { action: 'resolve', actorId: 'technician-1', baseVersion: 2 },
    { action: 'close', actorId: 'coordinator-1', baseVersion: 3 },
  ];
  for (const item of actions) {
    const remote = await fetchFromLocalBackend(`${baseUrl}/v1/incidents/campus-inc-001/actions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer course-valid-token',
        'X-Course-Actor': item.actorId, 'Idempotency-Key': `week-06-${item.action}-role-check` },
      body: JSON.stringify({ action: item.action, baseVersion: item.baseVersion, diagnosis: 'Reinicio de equipo ficticio' }),
    });
    statuses.push(remote.status);
  }
  check('backend-role-authorized-actions', 'nominal', { loginStatus: 200, actionStatuses: [201, 201, 201] },
    { loginStatus: login.status, actionStatuses: statuses });
});

test('el backend rechaza al perfil sin permiso y al token inválido', async () => {
  const forbidden = await fetchFromLocalBackend(`${baseUrl}/v1/incidents/campus-inc-001/actions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer course-valid-token',
      'X-Course-Actor': 'reporter-1', 'Idempotency-Key': 'week-06-denied-role-check' },
    body: JSON.stringify({ action: 'resolve', baseVersion: 4, diagnosis: 'Diagnóstico ficticio' }),
  });
  const unauthorized = await fetchFromLocalBackend(`${baseUrl}/v1/incidents`, {
    headers: { Authorization: 'Bearer invalid-token', 'X-Course-Actor': 'technician-1' },
  });
  check('backend-role-denied-actions', 'failure', { forbiddenStatus: 403, unauthorizedStatus: 401 },
    { forbiddenStatus: forbidden.status, unauthorizedStatus: unauthorized.status });
});
