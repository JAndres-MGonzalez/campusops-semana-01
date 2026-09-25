# Auditoría de seguridad — Semana 4

**Estudiante:** Kevin Armando Montalvo Marcial — Grupo 10-A
**Rama:** `week4/security-audit-kevin`
**Fecha:** 24/09/2026

> Todos los datos usados en esta actividad son ficticios. No hay contraseñas,
> tokens ni credenciales reales en el repositorio ni en las evidencias.

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Tokens del backend escritos directamente en el código | Cualquier persona con acceso al repositorio podía ver y usar esos tokens para llamar a los endpoints protegidos sin autorización | Se movieron a variables de entorno (valores ficticios en un archivo `.env` local ignorado por Git; `.env.example` solo con los nombres) | `docs/evidence/tokens-env-antes.txt`, `tokens-env-despues.txt`, `tokens-env-git-status.txt`, `tokens-env-self-test.txt`, `tokens-env-git-status.png` |
| 2 | El servidor permitía peticiones desde cualquier origen (CORS `*`) | Un sitio web cualquiera podría hacer peticiones al backend local y leer las respuestas, usándolo sin permiso | Se restringe a un origen configurable (por defecto solo el origen de desarrollo de Expo/Metro) y se rechaza con 403 cualquier otro origen | `docs/evidence/cors-antes.txt`, `cors-despues.txt`, `cors-restricted.txt`, `cors-restricted.png` |
| 3 | La sanitización de telemetría no estaba implementada (función pendiente) | Si se llegara a registrar telemetría o logs con datos de usuario o incidencias, la información sensible (emails, tokens, ubicaciones, fotos) quedaría expuesta en los registros | Se implementó `redactForTelemetry`: reemplaza con `[REDACTED]` los valores de las claves sensibles, conserva los campos técnicos y no modifica la entrada | `docs/evidence/redact-telemetry-codigo.txt`, `redact-telemetry-test.txt`, `redact-telemetry-demo.txt`, `redact-telemetry.png` |

---

## Hallazgo 1 — Tokens escritos directamente en el código

### Problema encontrado

En los archivos `course-backend/server.mjs` y `course-backend/campusops.mjs` el token de acceso y los tokens de refresco del backend didáctico estaban escritos literalmente (`'course-valid-token'`, `'course-refresh-0'`, `'course-refresh-1'`). Los self-tests también usaban el token escrito a mano.

### Riesgo

Cualquier persona con acceso al repositorio podía ver esos tokens y usarlos para llamar a los endpoints protegidos del backend como si estuviera autorizada. Aunque los valores eran ficticios, es un mal hábito que en un proyecto real podría exponer credenciales de verdad.

### Solución

Se quitó el token del código. Ahora el backend lee las variables de entorno (o el archivo local `.env`) mediante un módulo nuevo `course-backend/env.mjs`. El archivo `.env` contiene valores ficticios y está ignorado por Git; el `.env.example` únicamente lista los nombres de las variables, sin valores. Si no existe `.env`, no hay token válido y los endpoints protegidos responden 401.

### Antes

```mjs
// course-backend/server.mjs
if (request.headers.authorization !== 'Bearer course-valid-token') { ... }
return send(response, 200, { accessToken: 'course-valid-token', refreshToken: 'course-refresh-1', expiresIn: 60 });
```

### Después

```mjs
// course-backend/env.mjs
export const validToken = fromEnv('COURSE_VALID_TOKEN');
export const refreshToken0 = fromEnv('COURSE_REFRESH_TOKEN_0');
export const refreshToken1 = fromEnv('COURSE_REFRESH_TOKEN_1');

// course-backend/server.mjs
if (!validToken || request.headers.authorization !== `Bearer ${validToken}`) { ... }
return send(response, 200, { accessToken: validToken, refreshToken: refreshToken1, expiresIn: 60 });
```

### Evidencia

- Código antes y después: `docs/evidence/tokens-env-antes.txt` y `tokens-env-despues.txt`
- `git status` mostrando que `.env` NO se sube: `docs/evidence/tokens-env-git-status.txt` (+ captura `tokens-env-git-status.png`)
- Backend funcionando con la corrección: `docs/evidence/tokens-env-self-test.txt`

---

## Hallazgo 2 — CORS abierto a cualquier origen

### Problema encontrado

En `course-backend/server.mjs`, todas las respuestas del servidor incluían el encabezado `access-control-allow-origin: *`, es decir, cualquier origen podía hacer peticiones al backend y leer sus respuestas.

### Riesgo

Un sitio web malicioso podría hacer peticiones al backend local desde el navegador de otra persona y leer las respuestas sin restricciones. Para un servicio que maneja datos de incidencias, esto abre la puerta a usos no autorizados.

### Solución

Se restringió el CORS a un origen configurable (`COURSE_BACKEND_CORS_ORIGIN`). Por defecto solo se acepta el origen de desarrollo de Expo/Metro (`http://localhost:8081`). Si una petición llega con un origen distinto, el servidor responde `403 origin_not_allowed`. El `OPTIONS` (preflight) también responde con los métodos y encabezados permitidos únicamente para el origen autorizado.

### Antes

```mjs
response.writeHead(status, {
  'access-control-allow-origin': '*',
  ...
});
```

### Después

```mjs
export const corsOrigin = fromEnv('COURSE_BACKEND_CORS_ORIGIN') || 'http://localhost:8081';

// ...
...(corsOrigin ? { 'access-control-allow-origin': corsOrigin, vary: 'Origin' } : {}),

// Rechazo de orígenes no permitidos
if (requestOrigin && corsOrigin && requestOrigin !== corsOrigin) {
  return send(response, 403, { code: 'origin_not_allowed' });
}
```

### Evidencia

- Código antes y después: `docs/evidence/cors-antes.txt` y `cors-despues.txt`
- Salida real de peticiones (origen permitido → 200 con el encabezado correcto; origen no permitido → 403): `docs/evidence/cors-restricted.txt` (+ captura `cors-restricted.png`)

---

## Hallazgo 3 — Sanitización de telemetría sin implementar

### Problema encontrado

La función `redactForTelemetry` en `src/course-evaluation/index.ts` existía como pendiente (un stub que lanzaba error) y no hacía nada.

### Riesgo

El proyecto tenía prevista una sanitización para telemetría y logs, pero no estaba implementada. Si se llegara a registrar información de usuarios o incidencias (emails, tokens, ubicaciones, fotos, comentarios internos), esa información sensible quedaría expuesta en los registros.

### Solución

Se implementó la función según el contrato de la semana 4: recorre objetos y listas sin mutar la entrada, normaliza las claves a minúsculas y sin `_` ni `-`, reemplaza el valor completo por `[REDACTED]` cuando la clave es sensible y conserva los campos técnicos no sensibles (`incidentId`, `status`, `attempt`, etc.).

### Antes

```ts
export function redactForTelemetry(_input: unknown): unknown {
  return pending('redactForTelemetry');
}
```

### Después

```ts
export function redactForTelemetry(input: unknown): unknown {
  if (Array.isArray(input)) return input.map((item) => redactForTelemetry(item));
  if (input !== null && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) =>
        SENSITIVE_KEYS.has(normalizeKey(key))
          ? [key, '[REDACTED]']
          : [key, redactForTelemetry(value)],
      ),
    );
  }
  return input;
}
```

### Evidencia

- Código antes/después: `docs/evidence/redact-telemetry-codigo.txt`
- Prueba pública de la semana 4 en verde: `docs/evidence/redact-telemetry-test.txt` (+ captura `redact-telemetry.png`)
- Demo con objeto ficticio antes/después: `docs/evidence/redact-telemetry-demo.txt`

---

## Comprobación final

- [x] Rama creada: `week4/security-audit-kevin`
- [x] `docs/security-audit.md` creado
- [x] Mínimo 3 problemas identificados y explicados
- [x] Mínimo 2 problemas corregidos (se corrigieron los 3)
- [x] Evidencias por corrección dentro de `docs/evidence`
- [x] `.gitignore` revisado (incluye `.env`)
- [x] `git status` verificado: `.env` no se sube
- [x] Sin contraseñas, tokens ni credenciales reales (todo ficticio)
- [x] Checks en verde: typecheck, lint, smoke test, prueba pública semana 4, self-test del backend

> Todos los datos de este documento y de las evidencias son ficticios.