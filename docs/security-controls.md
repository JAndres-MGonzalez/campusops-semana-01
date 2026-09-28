# Controles de seguridad — CampusOps (equipo 9A-E08, Semana 4)

Este documento describe los controles de almacenamiento seguro y de sanitización de CampusOps y, para cada control, la verificación ejecutable que demuestra que funciona. Se apoya en `docs/threat-model.md` (Semana 3) y en la sección "Privacidad y permisos" de `docs/CAMPUSOPS.md`. Todos los datos de prueba son ficticios.

## 1. Alcance de datos

| Dato | Ejemplo en CampusOps | ¿Sensible? |
|---|---|---|
| Incidencias | reporte de falla en un laboratorio (`incidentId`, `status`) | El identificador y el estado no; el texto libre y los comentarios internos sí |
| Sesiones y credenciales | `authorization`, `password`, `token`, `accessToken`, `refreshToken` | Sí |
| Datos personales | `email`, `displayName`, `name`, `userId`, `reporterId`, `technicianId` | Sí |
| Fotografías | `photos`, `evidence` | Sí |
| Ubicaciones | `location`, `latitude`, `longitude` | Sí |
| Asignaciones | `assignedTechnicianId`, `assignmentHistory`, `internalComments` | Sí |
| Contexto técnico | `incidentId`, `correlationId`, `status`, `attempt`, `durationMs` | No; se conserva para diagnosticar |

Criterio de la semana: qué se guarda, qué se registra en logs y qué se redacta antes de registrarlo.

## 2. Controles de almacenamiento seguro

Se conserva el repositorio en memoria con incidencias ficticias. La app todavía no inicia sesiones reales ni guarda tokens en preferencias o archivos. Para este hito se eligió no persistir información privada: se reduce lo que podría quedar en el dispositivo, a cambio de perder el estado al cerrar el proceso. Esto no equivale a almacenamiento cifrado de credenciales.

Si después se necesita mantener una sesión real, sus credenciales deberán ir al almacenamiento protegido del sistema. Permanece el riesgo de inspección de memoria en un dispositivo comprometido y de que nuevas rutas guarden datos sin aplicar estos controles.

| ID | Control | Qué reduce | Verificación (comando real) |
|---|---|---|---|
| AL-1 | `.gitignore` excluye `node_modules/`, `.env`, `*.jks`, `*.keystore`, `*.p8`, `*.p12`, `.jest-cache/` y `.expo/` | Subir secretos, llaves de firma o dependencias al repositorio | `git check-ignore -v .env release.jks node_modules/ .jest-cache/` (cada ruta debe mostrar la regla que la ignora) |
| AL-2 | No se versionan archivos de credenciales | Filtración de tokens y llaves | `git ls-files \| Select-String -Pattern '(^\|/)\.env$\|\.jks$\|\.keystore$\|\.p12$\|\.p8$'` (sin resultados) |
| AL-3 | Escaneo de secretos del evaluador (`secret_scan`: llaves privadas, tokens de GitHub, llaves AWS y variables `EXPO_PUBLIC_*` con nombre secreto) | Credenciales en código o documentos | `make PYTHON=python verify-week-04` (el check `secret_scan` debe pasar) y la evidencia de falla controlada en `reports/week-04/secret-scan.json` |
| AL-4 | Permisos mínimos del workflow de CI (`contents: read`) | Que un workflow comprometido escriba en el repositorio | `git grep -n "contents: read" -- .github/workflows` |
| AL-5 | Datos de prueba solo sintéticos | Exponer datos personales reales | Revisión del PR: los ejemplos de `course-tests/` usan valores ficticios (`person@campusops.test`, `Persona ficticia`) |
## 3. Controles de sanitización

`redactForTelemetry` (contrato en `docs/CAMPUSOPS_API.md`, Semana 4) recorre objetos y listas y sustituye el valor completo por `[REDACTED]` cuando la clave coincide con la lista sensible.

**Normalización de la clave:** se convierte a minúsculas y se eliminan `_` y `-`. Así `access_token`, `Access-Token` y `accessToken` se tratan igual.

**Claves que se redactan** (forma del contrato → forma normalizada):

| Contrato | Normalizada |
|---|---|
| `authorization` | `authorization` |
| `password` | `password` |
| `token` | `token` |
| `accessToken` | `accesstoken` |
| `refreshToken` | `refreshtoken` |
| `email` | `email` |
| `displayName` | `displayname` |
| `name` | `name` |
| `userId` | `userid` |
| `reporterId` | `reporterid` |
| `technicianId` | `technicianid` |
| `assignedTechnicianId` | `assignedtechnicianid` |
| `location` | `location` |
| `latitude` | `latitude` |
| `longitude` | `longitude` |
| `photos` | `photos` |
| `evidence` | `evidence` |
| `internalComments` | `internalcomments` |
| `assignmentHistory` | `assignmenthistory` |

**No mutación:** la función devuelve una copia; el objeto de entrada no se modifica.

**Campos técnicos que se conservan:** `incidentId`, `correlationId`, `status`, `attempt`, `durationMs`.

**Límite:** la lista es un mínimo de prueba, no permiso para registrar texto libre sin sanitizar. Los errores completos se descartan del registro: se conserva el tipo de evento y la operación, y `error` queda como `[REDACTED]`. Esto evita filtrar también información incluida en el texto de un error.

## 4. Integración y verificación

La lógica compartida está en `src/infrastructure/telemetry/safe-telemetry.ts`. El adaptador público `redactForTelemetry` la llama y `App.tsx` inyecta `reportIncidentFailure` en la pantalla. Los errores de lista y detalle pasan por esa misma lógica antes de `console.warn`; la interfaz muestra un mensaje general.

La clave adicional `error` se oculta completa, incluso si contiene texto libre, ubicación o fotografías. No se escribe una copia del error en preferencias ni archivos. El archivo `evidence/week-04/logs/error-telemetry.json` contiene la salida capturada de las pruebas de ambos caminos, ya sanitizada.

Estos controles atienden T1 (exposición de credenciales) y T4 (datos sensibles en registros) del modelo de amenazas. No sustituyen los controles de autorización de T2/T3. La lista de claves no reconoce datos privados en cualquier texto arbitrario: por eso el registro real solo agrega el evento, la operación y el error completo oculto.

## 5. Tabla control → verificación

| ID | Control | Verificación ejecutable | Resultado esperado |
|---|---|---|---|
| SAN-1 | Redacción de claves sensibles con `[REDACTED]` | `npm.cmd test -- --ci --runInBand course-tests/public/week-04.test.ts` | La prueba pública de Semana 4 pasa |
| SAN-2 | Conservación de campos técnicos (`incidentId`, etc.) | Misma prueba pública (verifica que `incidentId` no cambia) | Pasa |
| SAN-3 | Normalización, listas y no mutación | `npm.cmd test -- --ci --runInBand evidence/week-04/sanitization.test.ts` | Cinco casos reproducibles aprobados |
| SAN-4 | Errores seguros en pantalla y logs | `npm.cmd test -- --ci --runInBand evidence/week-04/error-telemetry.test.tsx` | Errores de lista y detalle sin los datos ficticios privados |
| AL-1 | Archivos sensibles ignorados por Git | `git check-ignore -v .env release.jks node_modules/ .jest-cache/` | Cada ruta muestra su regla |
| AL-2 | Sin archivos de credenciales versionados | `git ls-files \| Select-String -Pattern '(^\|/)\.env$\|\.jks$\|\.keystore$'` | Sin resultados |
| AL-3 | Escaneo de secretos con falla controlada | Comando de `reports/week-04/secret-scan.json` (detecta el marcador sintético y luego queda limpio) | `fail` con marcador, `pass` sin él |
| AL-4 | Permisos mínimos de CI | `git grep -n "contents: read" -- .github/workflows` | Presente en los workflows |

Un control sin verificación ejecutable no se considera cumplido.
