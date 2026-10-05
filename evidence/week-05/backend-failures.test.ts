/** @jest-environment node */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import { parseRemoteResource, redactForTelemetry } from '../../src/course-evaluation';
import { HttpIncidentRepository } from '../../src/infrastructure/incidents/http-incident-repository';
import { IncidentRequestError, type IncidentFailureKind } from '../../src/domain/incident-request-error';
import { fetchFromLocalBackend } from './backend-transport';

const logs = join(process.cwd(), 'evidence/week-05/logs');
const headers = { Authorization: 'Bearer course-valid-token', 'X-Course-Actor': 'reporter-1' };
let backend: ChildProcess;
let baseUrl: string;

beforeAll(async () => {
  mkdirSync(logs, { recursive: true });
  backend = spawn(process.execPath, ['course-backend/server.mjs'], {
    env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  baseUrl = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Backend local no disponible')), 5000);
    backend.stdout?.on('data', (chunk: Buffer) => {
      const match = chunk.toString().match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
    backend.once('error', (error) => { clearTimeout(timer); reject(error); });
    backend.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Backend: ${code}`)); });
  });
});

afterAll(async () => {
  if (backend && backend.exitCode === null) {
    await new Promise<void>((resolve) => {
      backend.once('exit', () => resolve());
      backend.kill();
    });
  }
});

function requestFixture(scenario: string, timeoutMs = 3000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return new Promise<{ status: number; retryAfter: string | null; rawText: string }>((resolve, reject) => {
    const request = get(`${baseUrl}/v1/incidents`, {
      headers: { ...headers, 'X-Course-Scenario': scenario }, signal: controller.signal,
    }, (response) => {
      let rawText = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => { rawText += chunk; });
      response.on('end', () => {
        clearTimeout(timer);
        resolve({ status: response.statusCode ?? 0, retryAfter: response.headers['retry-after'] ?? null, rawText });
      });
      response.on('error', (error) => { clearTimeout(timer); reject(error); });
    });
    request.on('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

async function responseFor(scenario: string) {
  const response = await requestFixture(scenario);
  const { rawText } = response;
  let body: unknown = rawText;
  try { body = JSON.parse(rawText); } catch { /* Se conserva el JSON malformado del fixture. */ }
  // Los cuerpos nominales se sanitizan; los errores y payload-null no contienen datos privados.
  const observation = {
    scenario, status: response.status, retryAfter: response.retryAfter,
    body: redactForTelemetry(body), generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(logs, `${scenario}.json`), JSON.stringify(observation, null, 2) + '\n');
  return { response, rawText };
}

function client(scenario = 'success') {
  return new HttpIncidentRepository(baseUrl, { fetchImpl: fetchFromLocalBackend, scenario,
    timeoutMs: scenario === 'slow' || scenario === 'timeout_after_commit' ? 150 : 2000 });
}

async function expectClientFailure(scenario: string, kind: IncidentFailureKind) {
  let observed: unknown;
  try { await client(scenario).list(); } catch (error) { observed = error; }
  expect(observed).toBeInstanceOf(IncidentRequestError);
  expect(observed).toMatchObject({ kind });
  const error = observed as IncidentRequestError;
  const file = join(logs, `${scenario}.json`);
  const raw = scenario === 'slow' ? {} : JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...raw, scenario,
    client: { kind: error.kind, httpStatus: error.httpStatus, retryAfterSeconds: error.retryAfterSeconds },
    generatedAt: new Date().toISOString(),
  }, null, 2) + '\n');
  return error;
}

test('success: el backend entrega un sobre que acepta el parser compartido', async () => {
  const { response, rawText } = await responseFor('success');
  expect(response.status).toBe(200);
  const parsed = parseRemoteResource(JSON.parse(rawText).items[0]);
  expect(parsed.ok).toBe(true);
  const items = await client().list();
  expect(items[0]).toMatchObject({ id: 'campus-inc-001', category: 'connectivity' });
  const detail = await client().findById(items[0]!.id);
  expect(detail?.createdAt).toBeNull();
});

test('nullable: el payload nulo es válido y no se reemplaza por datos inventados', async () => {
  const { response, rawText } = await responseFor('nullable');
  expect(response.status).toBe(200);
  const parsed = parseRemoteResource(JSON.parse(rawText).items[0]);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.value.payload).toBeNull();
  expect(await client('nullable').list()).toEqual([]);
  expect(await client('nullable').findById('campus-inc-001')).toBeNull();
});

test('malformed: el cuerpo no es JSON válido y el parser rechaza el objeto inválido', async () => {
  const { response, rawText } = await responseFor('malformed');
  expect(response.status).toBe(200);
  expect(() => JSON.parse(rawText)).toThrow(SyntaxError);
  expect(parseRemoteResource({ id: '', version: 1, status: 'open', payload: null }))
    .toEqual({ ok: false, error: 'contract' });
  await expectClientFailure('malformed', 'contract');
});

test('server_error: se observa HTTP 500 y su código de error', async () => {
  const { response, rawText } = await responseFor('server_error');
  expect(response.status).toBe(500);
  expect(JSON.parse(rawText)).toEqual({ code: 'controlled_failure' });
  expect(await expectClientFailure('server_error', 'server')).toMatchObject({ httpStatus: 500 });
});

test('rate_limited: se observa HTTP 429 y Retry-After', async () => {
  const { response, rawText } = await responseFor('rate_limited');
  expect(response.status).toBe(429);
  expect(response.retryAfter).toBe('1');
  expect(JSON.parse(rawText)).toEqual({ code: 'rate_limited' });
  expect(await expectClientFailure('rate_limited', 'rate_limit')).toMatchObject({ retryAfterSeconds: 1 });
});

test('slow: el cliente real aborta al llegar al límite de espera y devuelve un error de timeout', async () => {
  await expectClientFailure('slow', 'timeout');
});

test('crea, consulta y repite la misma operación sin duplicar la incidencia', async () => {
  const repository = client();
  const draft = { category: 'maintenance' as const, description: 'Falla ficticia de mantenimiento', location: 'Zona de prueba' };
  const created = await repository.create(draft, 'week05-create-operation');
  expect(created?.description).toBe(draft.description);
  const repeated = await repository.create(draft, 'week05-create-operation');
  expect(repeated?.id).toBe(created?.id);
  expect((await repository.list()).filter((item) => item.id === created?.id)).toHaveLength(1);
  expect(await repository.findById(created!.id)).toEqual(created);
  writeFileSync(join(logs, 'creation.json'), JSON.stringify({
    scenario: 'create-and-replay', incidentId: created!.id, duplicateCount: 1, result: 'pass',
    generatedAt: new Date().toISOString(),
  }, null, 2) + '\n');
});

test('recupera una creación cuya respuesta se perdió sin duplicarla al repetir la clave', async () => {
  const repository = client('timeout_after_commit');
  const draft = { category: 'water' as const, description: 'Fuga ficticia de prueba', location: 'Zona de prueba' };
  let observed: unknown;
  try { await repository.create(draft, 'week05-lost-response'); } catch (error) { observed = error; }
  expect(observed).toMatchObject({ kind: 'timeout' });
  const repeated = await repository.create(draft, 'week05-lost-response');
  expect(repeated?.description).toBe(draft.description);
  expect((await client().list()).filter((item) => item.id === repeated?.id)).toHaveLength(1);
  writeFileSync(join(logs, 'write-timeout.json'), JSON.stringify({
    scenario: 'timeout_after_commit', before: { kind: (observed as IncidentRequestError).kind },
    after: { incidentId: repeated!.id, duplicateCount: 1 }, generatedAt: new Date().toISOString(),
  }, null, 2) + '\n');
});
