import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { request } from 'node:http';
import { test } from 'node:test';

async function startBackend(context) {
  const child = spawn(process.execPath, ['course-backend/server.mjs'], {
    env: { ...process.env, COURSE_BACKEND_HOST: '127.0.0.1', COURSE_BACKEND_PORT: '0' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let errors = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { errors += chunk; });
  context.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill();
      await closed;
    }
  });
  const baseUrl = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Backend startup timeout')), 5000);
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const match = output.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[0]);
      }
    });
    child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Backend exited with ${code}: ${errors}`));
    });
  });
  return { baseUrl, errors: () => errors };
}

function get(baseUrl, path, host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const req = request(baseUrl, { path, headers: { host } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body }));
      response.on('error', reject);
    });
    req.setTimeout(3000, () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    req.end();
  });
}

for (const sample of [
  { name: 'un Host malformado no detiene el backend', path: '/health', host: '[', status: 200 },
  { name: 'una URL malformada devuelve 400 y el backend sigue disponible', path: 'http://[', host: '127.0.0.1', status: 400 },
]) {
  test(sample.name, { timeout: 10000 }, async (context) => {
    const backend = await startBackend(context);
    let response;
    try {
      response = await get(backend.baseUrl, sample.path, sample.host);
    } catch (error) {
      throw new Error(`La petición interrumpió el servicio: ${error.message}\n${backend.errors()}`);
    }
    assert.equal(response.status, sample.status);
    if (sample.status === 400) {
      assert.deepEqual(JSON.parse(response.body), { code: 'invalid_request' });
    }
    const health = await get(backend.baseUrl, '/health');
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).ok, true);
    assert.equal((await get(backend.baseUrl, '/v1/resources')).status, 401);
  });
}
