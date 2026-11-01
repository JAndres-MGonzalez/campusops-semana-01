import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

// Ejecuta el módulo real con un backend aislado. Sólo registra métricas técnicas.
const temporary = mkdtempSync(join(tmpdir(), 'campusops-retry-'));
const child = spawn(process.execPath, ['course-backend/server.mjs'], {
  env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
});
try {
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('El backend no inició')), 10000);
    child.once('error', reject);
    child.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`El backend terminó: ${code}`)); });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) { clearTimeout(timeout); resolve(match[0]); }
    });
  });
  for (const name of ['retry-policy', 'retry-executor']) {
    const source = readFileSync(`src/infrastructure/resilience/${name}.ts`, 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    writeFileSync(join(temporary, `${name}.mjs`), outputText.replace("from './retry-policy'", "from './retry-policy.mjs'"));
  }
  const { runWithRetry } = await import(pathToFileURL(join(temporary, 'retry-executor.mjs')).href);
  const api = async (method, path, actor, body, key, scenario, signal) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method, signal,
      headers: {
        Authorization: 'Bearer course-valid-token', 'X-Course-Actor': actor,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
        ...(scenario ? { 'X-Course-Scenario': scenario } : {}),
      },
      ...(body ? { body } : {}),
    });
    assert.ok(response.ok, `HTTP ${response.status}`);
    return response.json();
  };
  const path = '/v1/incidents/campus-inc-001/actions';
  await api('POST', path, 'technician-1', JSON.stringify({ action: 'start', baseVersion: 1 }), 'andres-prepare-09');
  const observations = [];
  for (const input of [
    { action: 'resolve', actor: 'technician-1', baseVersion: 2, diagnosis: 'Diagnóstico ficticio', expected: 'resolved' },
    { action: 'close', actor: 'coordinator-1', baseVersion: 3, expected: 'closed' },
  ]) {
    const key = `andres-lost-${input.action}-09`;
    const body = JSON.stringify({ action: input.action, baseVersion: input.baseVersion, ...(input.diagnosis ? { diagnosis: input.diagnosis } : {}) });
    let requests = 0;
    const startedAt = performance.now();
    const startsMs = [];
    const waitsMs = [];
    const requestedWaitsMs = [];
    const sent = [];
    const outcome = await runWithRetry({
      method: 'POST', idempotencyKey: key, classify: (error) => error.name === 'AbortError' ? 'timeout' : null,
      sleep: async (ms) => {
        requestedWaitsMs.push(ms);
        const start = performance.now();
        await new Promise((resolve) => setTimeout(resolve, ms));
        waitsMs.push(Math.round(performance.now() - start));
      },
      execute: async () => {
        requests += 1; startsMs.push(Math.round(performance.now() - startedAt)); sent.push({ key, body });
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 800);
        try { return await api('POST', path, input.actor, body, key, 'timeout_after_commit', controller.signal); }
        finally { clearTimeout(timer); }
      },
    });
    assert.equal(outcome.ok, true);
    assert.equal(outcome.attempts, 2);
    assert.equal(outcome.value.duplicate, true);
    assert.deepEqual(requestedWaitsMs, [500]);
    assert.deepEqual(sent[0], sent[1]);
    const final = await api('GET', '/v1/incidents/campus-inc-001', input.actor);
    const historyEvents = final.payload.history.filter((event) => event.operationId === key).length;
    assert.equal(historyEvents, 1);
    assert.equal(final.status, input.expected);
    assert.equal(final.version, input.baseVersion + 1);
    const metric = { id: `lost-response-${input.action}-live`, requests, requestedWaitsMs, waitsMs, startsMs, elapsedMs: Math.round(performance.now() - startedAt), duplicate: true, historyEvents, version: final.version, state: final.status, stableKey: true, stableBody: true };
    observations.push(metric);
    console.log(JSON.stringify(metric));
  }
  const output = process.env.CAMPUSOPS_LIVE_OBSERVATIONS ?? 'evidence/week-09/logs/retry-live-observations.json';
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ generatedAt: new Date().toISOString(), backend: 'isolated-local', observations }, null, 2) + '\n');
} finally {
  child.kill();
  rmSync(temporary, { recursive: true, force: true });
}
