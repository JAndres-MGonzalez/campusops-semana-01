#!/usr/bin/env node
/**
 * Inyección de fallas de la Semana 9 (Parte B) contra el backend controlado.
 *
 * Ejecuta el código REAL de la app (provider, caché, servicio y
 * `selectIncidentLocationReal`): transpila los .ts a una carpeta temporal y los
 * importa, sin duplicar su lógica.
 *
 * Uso (con `npm run backend` encendido en otra terminal y recién reiniciado):
 *   node evidence/week-09/scripts/fault-injection.mjs
 *   node evidence/week-09/scripts/fault-injection.mjs --report reports/week-09/fault-injection.json
 *
 * Sólo imprime id de incidencia, estado, version, duplicate, origen y tipo de
 * fallo. No imprime tokens, actores, consultas, etiquetas ni coordenadas.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import ts from 'typescript';

const ROOT = process.cwd();
const BACKEND = process.env.BACKEND_URL ?? 'http://127.0.0.1:4310';
const TOKEN = 'course-valid-token';
const COMMAND = 'node evidence/week-09/scripts/fault-injection.mjs';
const INCIDENT = 'campus-inc-001';
const KEY = 'resolve-campus-inc-001-op-9';

// ---------------------------------------------------------------------------
// Carga del código real de la app (TypeScript → .mjs temporal)
// ---------------------------------------------------------------------------
const SOURCES = [
  'src/domain/incident-request-error.ts',
  'src/infrastructure/geocoding/provider.ts',
  'src/infrastructure/geocoding/cache.ts',
  'src/infrastructure/geocoding/select-location.ts',
  'src/infrastructure/geocoding/service.ts',
];

async function loadApp() {
  const out = mkdtempSync(join(tmpdir(), 'campusops-w09-'));
  for (const file of SOURCES) {
    const source = readFileSync(resolve(ROOT, file), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    const code = outputText.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, '$1$2.mjs$3');
    const target = join(out, file.replace(/\.ts$/, '.mjs'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, code);
  }
  const load = (file) => import(pathToFileURL(join(out, file.replace(/\.ts$/, '.mjs'))).href);
  const app = {
    provider: await load('src/infrastructure/geocoding/provider.ts'),
    cache: await load('src/infrastructure/geocoding/cache.ts'),
    service: await load('src/infrastructure/geocoding/service.ts'),
  };
  return { app, cleanup: () => rmSync(out, { recursive: true, force: true }) };
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const checks = [];
const record = (id, scenarioType, pass, evidence) => {
  checks.push({ id, status: pass ? 'pass' : 'fail', scenarioType, command: COMMAND, evidence });
  console.log(`${pass ? 'PASS' : 'FAIL'} [${scenarioType}] ${id}: ${evidence}`);
};

/** `fetch` que cuenta las solicitudes reales que salen hacia el backend. */
function countingFetch() {
  const state = { count: 0 };
  const fetchImpl = (url, init) => { state.count += 1; return fetch(url, init); };
  return { state, fetchImpl };
}

function buildService(app, { scenario, timeoutMs = 2000, baseUrl = BACKEND, withCache = false } = {}) {
  const counter = countingFetch();
  const observations = [];
  const errors = { last: null };
  const rawLookup = app.provider.createHttpGeocodingProvider({
    baseUrl,
    timeoutMs,
    fetchImpl: counter.fetchImpl,
    tokenProvider: async () => TOKEN,
    actorProvider: () => 'reporter-1',
    ...(scenario !== undefined ? { scenario } : {}),
  });
  const lookup = async (query) => {
    try { return await rawLookup(query); } catch (error) { errors.last = error; throw error; }
  };
  const service = app.service.createLocationService({
    lookup,
    ...(withCache ? { cache: app.cache.createLocationCache() } : {}),
    onObservation: (observation) => observations.push(observation),
  });
  return { service, counter, observations, errors };
}

const describe = (resolution, extra = '') =>
  `origen=${resolution.origin} fallo=${resolution.failure ?? 'ninguno'}${extra}`;

async function api(method, path, { actor, scenario, key, body, abortMs } = {}) {
  const controller = new AbortController();
  const timer = abortMs === undefined ? undefined : setTimeout(() => controller.abort(), abortMs);
  try {
    const response = await fetch(`${BACKEND}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'X-Course-Actor': actor,
        ...(scenario !== undefined ? { 'X-Course-Scenario': scenario } : {}),
        ...(key !== undefined ? { 'Idempotency-Key': key } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, json: await response.json() };
  } catch (error) {
    return { aborted: controller.signal.aborted, error: error instanceof Error ? error.name : 'Error' };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

const incidentSummary = (incident) => {
  const history = incident.payload.history.filter((event) => event.operationId === KEY);
  return { status: incident.status, version: incident.version, events: history.length };
};

// ---------------------------------------------------------------------------
// Escenarios
// ---------------------------------------------------------------------------
async function main() {
  const reportIndex = process.argv.indexOf('--report');
  const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : undefined;

  // Precondición: backend vivo y recién reiniciado (la incidencia semilla sin tocar).
  const baseline = await api('GET', `/v1/incidents/${INCIDENT}`, { actor: 'technician-1' });
  if (baseline.status !== 200) {
    console.error(`El backend no responde en ${BACKEND}. Ejecuta "npm run backend" en otra terminal.`);
    process.exit(2);
  }
  if (baseline.json.status !== 'assigned' || baseline.json.version !== 1) {
    console.error('El backend ya fue usado (la incidencia semilla cambió). Reinícialo con "npm run backend" y repite.');
    process.exit(2);
  }

  const { app, cleanup } = await loadApp();
  try {
    // 1) Éxito, incluido el límite (0,0)
    {
      const { service, counter } = buildService(app);
      const result = await service.resolve('Zona A', 'Zona A');
      const ok = result.origin === 'provider' && result.location.source === 'provider' && counter.state.count === 1;
      record('geocoding-success', 'nominal', ok, `${describe(result)} solicitudes=${counter.state.count}`);
      const zero = result.location.latitude === 0 && result.location.longitude === 0;
      record('geocoding-zero-coordinates-accepted', 'boundary', ok && zero,
        `las coordenadas (0,0) del proveedor se conservaron como válidas: origen=${result.origin}`);
    }

    // 2) Caché: dos búsquedas idénticas → una sola solicitud al proveedor
    {
      const { service, counter } = buildService(app, { withCache: true });
      const first = await service.resolve('Zona A', 'Zona A');
      const second = await service.resolve('  zona   a ', 'Zona A');
      const ok = first.origin === 'provider' && second.origin === 'cache' && counter.state.count === 1;
      record('geocoding-cache-hit', 'nominal', ok,
        `primera=${first.origin} segunda=${second.origin} solicitudes al proveedor=${counter.state.count}`);
    }

    // 3) Coordenadas inválidas → manual
    {
      const { service, counter } = buildService(app, { scenario: 'invalid_coordinates' });
      const result = await service.resolve('Zona A', 'Zona A');
      const ok = result.origin === 'manual' && result.failure === 'contract'
        && result.location.source === 'manual' && !('latitude' in result.location);
      record('geocoding-invalid-coordinates', 'failure', ok,
        `${describe(result)} sin coordenadas inventadas solicitudes=${counter.state.count}`);
    }

    // 4) Datos incompletos → manual
    {
      const { service, counter } = buildService(app, { scenario: 'incomplete' });
      const result = await service.resolve('Zona A', 'Zona A');
      const ok = result.origin === 'manual' && result.failure === 'contract' && !('latitude' in result.location);
      record('geocoding-incomplete', 'failure', ok,
        `${describe(result)} sin coordenadas inventadas solicitudes=${counter.state.count}`);
    }

    // 5) 429 con Retry-After → una sola solicitud y manual
    {
      const { service, counter, errors } = buildService(app, { scenario: 'rate_limited' });
      const result = await service.resolve('Zona A', 'Zona A');
      const retryAfter = errors.last?.retryAfterSeconds;
      const ok = result.origin === 'manual' && result.failure === 'rate_limit'
        && counter.state.count === 1 && retryAfter === 1;
      record('geocoding-rate-limited', 'failure', ok,
        `${describe(result)} retry-after=${retryAfter}s solicitudes=${counter.state.count} (sin reintento)`);
    }

    // 6) Error 500 → manual
    {
      const { service, counter } = buildService(app, { scenario: 'server_error' });
      const result = await service.resolve('Zona A', 'Zona A');
      const ok = result.origin === 'manual' && result.failure === 'server' && counter.state.count === 1;
      record('geocoding-server-error', 'failure', ok,
        `${describe(result)} solicitudes=${counter.state.count} (sin reintento)`);
    }

    // 7) Respuesta lenta con timeout de 800 ms → manual, sin colgarse
    {
      const { service, counter, observations } = buildService(app, { scenario: 'slow', timeoutMs: 800 });
      const startedAt = Date.now();
      const result = await service.resolve('Zona A', 'Zona A');
      const elapsed = Date.now() - startedAt;
      const ok = result.origin === 'manual' && result.failure === 'timeout' && elapsed < 1200
        && counter.state.count === 1 && observations.length === 1;
      record('geocoding-slow-timeout', 'boundary', ok,
        `${describe(result)} timeout=800ms transcurrido=${elapsed}ms solicitudes=${counter.state.count}`);
    }

    // 8) Desconexión (puerto cerrado) → manual
    {
      const { service, counter } = buildService(app, { baseUrl: 'http://127.0.0.1:1', timeoutMs: 800 });
      const result = await service.resolve('Zona A', 'Zona A');
      const ok = result.origin === 'manual' && result.failure === 'network' && counter.state.count === 1;
      record('geocoding-network-down', 'failure', ok,
        `${describe(result)} solicitudes=${counter.state.count} (sin reintento)`);
    }

    // 9) Respuesta perdida tras guardar: mismo POST, misma clave, mismo contenido
    {
      const body = { action: 'start', baseVersion: 1 };
      const lost = await api('POST', `/v1/incidents/${INCIDENT}/actions`, {
        actor: 'technician-1', scenario: 'timeout_after_commit', key: KEY, body, abortMs: 800,
      });
      const lostOk = lost.aborted === true;
      const afterLoss = await api('GET', `/v1/incidents/${INCIDENT}`, { actor: 'technician-1' });
      const committed = afterLoss.status === 200 ? incidentSummary(afterLoss.json) : null;
      record('lost-response-committed-before-timeout', 'failure',
        lostOk && committed?.status === 'in_progress',
        `la respuesta se perdió (abort a 800ms) pero el servidor guardó: id=${INCIDENT} estado=${committed?.status} version=${committed?.version}`);

      const replay = await api('POST', `/v1/incidents/${INCIDENT}/actions`, {
        actor: 'technician-1', key: KEY, body,
      });
      record('lost-response-replay-duplicate-true', 'failure',
        replay.status === 200 && replay.json?.duplicate === true,
        `repetición con la misma clave: HTTP ${replay.status} duplicate=${replay.json?.duplicate}`);

      const final = await api('GET', `/v1/incidents/${INCIDENT}`, { actor: 'technician-1' });
      const end = final.status === 200 ? incidentSummary(final.json) : null;
      record('lost-response-single-history-event', 'boundary',
        end !== null && committed !== null && end.version === committed.version && end.events === 1,
        `GET final: id=${INCIDENT} estado=${end?.status} version=${end?.version} eventos con esa clave=${end?.events}`);
    }
  } finally {
    cleanup();
  }

  const failed = checks.filter((check) => check.status !== 'pass');
  console.log(`\nResumen: ${checks.length - failed.length}/${checks.length} comprobaciones en pass.`);

  if (reportPath !== undefined) {
    const commitSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const report = {
      schemaVersion: 1,
      week: 9,
      commitSha,
      generatedAt: new Date().toISOString(),
      checks: checks.map((check) => ({
        ...check,
        evidence: `Salida real en evidence/week-09/logs/fault-injection.log: ${check.evidence}`,
      })),
    };
    mkdirSync(dirname(resolve(ROOT, reportPath)), { recursive: true });
    writeFileSync(resolve(ROOT, reportPath), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Reporte escrito en ${reportPath}`);
  }
  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`Fallo inesperado del script: ${error instanceof Error ? error.message : 'error'}`);
  process.exit(2);
});
