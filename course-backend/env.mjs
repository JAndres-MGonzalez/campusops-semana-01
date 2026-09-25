// course-backend/env.mjs
// Corrección Semana 4 — Auditoría de seguridad (Hallazgo 1).
// Carga de variables de entorno sin dependencias. El backend didáctico mantiene
// sus tokens (ficticios) fuera del código fuente: los valores provienen del
// entorno o del archivo `.env` local (ignorado por Git). `.env.example` lista
// únicamente los nombres de las variables, sin valores.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_FILE = resolve(dirname(fileURLToPath(import.meta.url)), '..', '.env');

function readDotEnv() {
  if (!existsSync(ENV_FILE)) return {};
  const values = {};
  for (const rawLine of readFileSync(ENV_FILE, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const dotEnv = readDotEnv();
const fromEnv = (name) => process.env[name] ?? dotEnv[name] ?? '';

// Valores ficticios para la práctica docente; nunca credenciales institucionales.
export const validToken = fromEnv('COURSE_VALID_TOKEN');
export const refreshToken0 = fromEnv('COURSE_REFRESH_TOKEN_0');
export const refreshToken1 = fromEnv('COURSE_REFRESH_TOKEN_1');

// Origen permitido para CORS (configurable). Por defecto solo el origen de
// desarrollo de Expo/Metro; nunca "*" para no abrir el backend a cualquier sitio.
export const corsOrigin = fromEnv('COURSE_BACKEND_CORS_ORIGIN') || 'http://localhost:8081';