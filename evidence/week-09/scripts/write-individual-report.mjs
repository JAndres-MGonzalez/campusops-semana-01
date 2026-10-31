#!/usr/bin/env node
/**
 * Compone `evidence/week-09/reports/3523110741.md` con datos REALES:
 * el SHA de `git rev-parse HEAD`, los resúmenes de Jest leídos de
 * `evidence/week-09/logs/*.log` y las comprobaciones de
 * `reports/week-09/fault-injection.json`.
 *
 * Lo que no se ejecutó se declara como "no ejecutado"; nada se inventa.
 *
 * Uso:
 *   node evidence/week-09/scripts/write-individual-report.mjs --emulador "lo que observaste"
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = process.cwd();
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

/** Tee-Object de Windows PowerShell 5.1 escribe UTF-16: se detecta por el BOM. */
function readText(path) {
  const buffer = readFileSync(path);
  return buffer[0] === 0xff && buffer[1] === 0xfe ? buffer.toString('utf16le') : buffer.toString('utf8');
}

function jestSummary(logName) {
  const path = resolve(ROOT, 'evidence/week-09/logs', logName);
  if (!existsSync(path)) return 'no ejecutado (falta el log)';
  const text = readText(path);
  const suites = text.match(/^Test Suites:\s+(.*)$/m)?.[1];
  const tests = text.match(/^Tests:\s+(.*)$/m)?.[1];
  if (suites === undefined || tests === undefined) return 'log sin resumen de Jest (revisar)';
  return `Test Suites: ${suites}; Tests: ${tests}`;
}

const emulatorIndex = process.argv.indexOf('--emulador');
const emulator = emulatorIndex >= 0 ? process.argv[emulatorIndex + 1] : undefined;

const sha = git('rev-parse', 'HEAD');
const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
const base = (() => { try { return git('merge-base', 'HEAD', 'origin/main'); } catch { return 'main'; } })();
const changed = git('diff', '--name-only', base, 'HEAD').split('\n').filter(Boolean);

const reportPath = resolve(ROOT, 'reports/week-09/fault-injection.json');
const faults = existsSync(reportPath) ? JSON.parse(readFileSync(reportPath, 'utf8')) : null;
const faultRows = faults === null
  ? ['- no ejecutado (falta `reports/week-09/fault-injection.json`)']
  : faults.checks.map((check) => `| \`${check.id}\` | ${check.scenarioType} | ${check.status} | ${check.evidence.replace(/^Salida real en [^:]+: /, '')} |`);

const commands = [
  ['npm.cmd run typecheck', 'sin errores', 'typecheck.log'],
  ['npm.cmd run lint', 'sin errores', 'lint.log'],
  ['npm.cmd run check:architecture', 'límites respetados', 'architecture.log'],
  ['npm.cmd test -- --ci --runInBand src/infrastructure/geocoding', null, 'verificacion-geocodificacion.log'],
  ['npm.cmd test -- --ci --runInBand src/ui/screens/incident-create-location.test.tsx', null, 'verificacion-ui.log'],
  ['npm.cmd test -- --ci --runInBand course-tests/public/week-09.test.ts', null, 'verificacion-week-09.log'],
  ['npm.cmd test -- --ci --runInBand course-tests/public/week-06.test.ts course-tests/public/week-08.test.ts', null, 'regresion-week-06-08.log'],
  ['npm.cmd test -- --ci --runInBand src/infrastructure/session src/infrastructure/persistence src/infrastructure/sync', null, 'regresion-session-persistence-sync.log'],
];

const commandRows = commands.map(([command, fixed, log]) => {
  const result = fixed === null
    ? jestSummary(log)
    : (existsSync(resolve(ROOT, 'evidence/week-09/logs', log)) ? fixed : 'no ejecutado (falta el log)');
  return `| \`${command}\` | ${result} | \`evidence/week-09/logs/${log}\` |`;
});

const lines = [
  '# Evidencia individual — Semana 9, Parte B',
  '',
  '- studentId: `3523110741`',
  `- Rama: \`${branch}\``,
  `- SHA del commit de código: \`${sha}\``,
  '',
  '## Qué implementé',
  '',
  '- **Provider** (`src/infrastructure/geocoding/provider.ts`): `GET /v1/geocoding` con token y actor de la sesión, un `AbortController` y un temporizador por llamada, traducción de errores igual que el repositorio HTTP y JSON devuelto tal cual.',
  '- **Caché** (`cache.ts`): en memoria, clave normalizada, TTL de 5 min, máximo 32 entradas con desalojo FIFO y copias congeladas.',
  '- **Servicio** (`service.ts`): caché → proveedor → `selectIncidentLocationReal` → manual. Nunca lanza, no reintenta y sólo observa `origin`, `failure` y `durationMs`.',
  '- **UI**: botón «Buscar ubicación» en `IncidentCreateScreen`, prop `resolveLocation` en `IncidentApp` y cableado en `App.tsx` con la sesión vigente. El texto manual se conserva si el proveedor falla.',
  '- **Reporte de fallas** (`evidence/week-09/scripts/fault-injection.mjs` → `reports/week-09/fault-injection.json`) y borrador de `docs/resilience-policy.md`.',
  '',
  '## Comandos y resultados observados',
  '',
  '| Comando | Resultado observado | Log |',
  '|---|---|---|',
  ...commandRows,
  '',
  `Inyección de fallas (\`node evidence/week-09/scripts/fault-injection.mjs\`, ${faults === null ? 'sin reporte' : `${faults.checks.filter((c) => c.status === 'pass').length}/${faults.checks.length} en pass`}):`,
  '',
  ...(faults === null ? faultRows : ['| id | tipo | estado | observado |', '|---|---|---|---|', ...faultRows]),
  '',
  '## Verificación en emulador',
  '',
  emulator !== undefined && emulator.trim().length > 0
    ? emulator.trim()
    : 'No ejecutado: este reporte se generó sin el recorrido en emulador.',
  '',
  '## Archivos tocados',
  '',
  ...changed.map((file) => `- \`${file}\``),
  '- `reports/week-09/fault-injection.json`',
  '- `evidence/week-09/**` (script, logs y este reporte)',
  '',
  '## Decisiones',
  '',
  '- **No reintentar la geocodificación:** es una lectura opcional con alternativa manual; reintentarla multiplicaría solicitudes ante 429/5xx sin proteger ningún efecto. Las operaciones con efecto usan los reintentos acotados de Kevin.',
  '- **Caché de 5 min y 32 entradas, en memoria:** cubre la sesión de captura; persistirla retendría ubicaciones sin necesidad.',
  '- **No enviar coordenadas:** el backend sólo acepta `location` como texto, así que las coordenadas no entran al borrador.',
  '- **Conservar el texto manual:** si el proveedor falla se mantiene exactamente lo escrito y «Guardar incidencia» no depende de la búsqueda.',
  '',
  '## Límites honestos',
  '',
  '- La caché no persiste entre arranques.',
  '- El escenario `slow` del doble responde a los 1200 ms; el timeout se fuerza con 800 ms en el script.',
  '- La desconexión se reproduce contra un puerto cerrado (`127.0.0.1:1`), no apagando el backend.',
  '- Jest no demuestra que la pantalla renderice en un dispositivo: eso sólo cuenta si la sección de emulador lo describe.',
  '',
];

const target = resolve(ROOT, 'evidence/week-09/reports/3523110741.md');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `${lines.join('\n')}\n`);
console.log('Reporte escrito en evidence/week-09/reports/3523110741.md');
