/** @jest-environment node */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { get } from 'node:http';
import { join } from 'node:path';
import { parseRemoteResource, redactForTelemetry } from '../../src/course-evaluation';

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

test('success: el backend entrega un sobre que acepta el parser compartido', async () => {
  const { response, rawText } = await responseFor('success');
  expect(response.status).toBe(200);
  const parsed = parseRemoteResource(JSON.parse(rawText).items[0]);
  expect(parsed.ok).toBe(true);
});

test('nullable: el payload nulo es válido y no se reemplaza por datos inventados', async () => {
  const { response, rawText } = await responseFor('nullable');
  expect(response.status).toBe(200);
  const parsed = parseRemoteResource(JSON.parse(rawText).items[0]);
  expect(parsed.ok).toBe(true);
  if (parsed.ok) expect(parsed.value.payload).toBeNull();
});

test('malformed: el cuerpo no es JSON válido y el parser rechaza el objeto inválido', async () => {
  const { response, rawText } = await responseFor('malformed');
  expect(response.status).toBe(200);
  expect(() => JSON.parse(rawText)).toThrow(SyntaxError);
  expect(parseRemoteResource({ id: '', version: 1, status: 'open', payload: null }))
    .toEqual({ ok: false, error: 'contract' });
});

test('server_error: se observa HTTP 500 y su código de error', async () => {
  const { response, rawText } = await responseFor('server_error');
  expect(response.status).toBe(500);
  expect(JSON.parse(rawText)).toEqual({ code: 'controlled_failure' });
});

test('rate_limited: se observa HTTP 429 y Retry-After', async () => {
  const { response, rawText } = await responseFor('rate_limited');
  expect(response.status).toBe(429);
  expect(response.retryAfter).toBe('1');
  expect(JSON.parse(rawText)).toEqual({ code: 'rate_limited' });
});

test('slow: una solicitud real al backend se aborta al llegar al límite de espera', async () => {
  await expect(requestFixture('slow', 150)).rejects.toMatchObject({ name: 'AbortError' });
  writeFileSync(join(logs, 'slow.json'), JSON.stringify({
    scenario: 'slow', timeoutMs: 150, observedError: 'AbortError',
    generatedAt: new Date().toISOString(),
  }, null, 2) + '\n');
});
