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

En el hito actual los datos de CampusOps viven en memoria durante la ejecución; no hay base de datos real ni datos personales reales en el repositorio.

| ID | Control | Qué reduce | Verificación (comando real) |
|---|---|---|---|
| AL-1 | `.gitignore` excluye `node_modules/`, `.env`, `*.jks`, `*.keystore`, `*.p8`, `*.p12`, `.jest-cache/` y `.expo/` | Subir secretos, llaves de firma o dependencias al repositorio | `git check-ignore -v .env release.jks node_modules .jest-cache` (cada ruta debe mostrar la regla que la ignora) |
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

**Límite:** la lista es un mínimo de prueba, no permiso para registrar texto libre sin sanitizar. Por eso el código de `src/` no usa `console` para volcar datos.

## 4. Tabla control → verificación

| ID | Control | Verificación ejecutable | Resultado esperado |
|---|---|---|---|
| SAN-1 | Redacción de claves sensibles con `[REDACTED]` | `npm.cmd test -- --ci --runInBand course-tests/public/week-04.test.ts` | La prueba pública de Semana 4 pasa |
| SAN-2 | Conservación de campos técnicos (`incidentId`, etc.) | Misma prueba pública (verifica que `incidentId` no cambia) | Pasa |
| SAN-3 | Normalización de claves y no mutación de la entrada | `git grep -n -e normalizeKey -e SENSITIVE_KEYS -e "Object.fromEntries" -- src/course-evaluation/index.ts` (muestra la normalización, la lista sensible y la construcción de copias); evidencia de las pruebas negativas de Kevin en `reports/week-04/negative-tests.json`, cuyas pruebas usaron un archivo temporal ya retirado | Las tres referencias aparecen en `src/`; el JSON registra la falla y la corrección |
| SAN-4 | No registrar datos sensibles en logs | `git grep -n console -- src` | Sin resultados |
| AL-1 | Archivos sensibles ignorados por Git | `git check-ignore -v .env release.jks node_modules .jest-cache` | Cada ruta muestra su regla |
| AL-2 | Sin archivos de credenciales versionados | `git ls-files \| Select-String -Pattern '(^\|/)\.env$\|\.jks$\|\.keystore$'` | Sin resultados |
| AL-3 | Escaneo de secretos con falla controlada | Comando de `reports/week-04/secret-scan.json` (detecta el marcador sintético y luego queda limpio) | `fail` con marcador, `pass` sin él |
| AL-4 | Permisos mínimos de CI | `git grep -n "contents: read" -- .github/workflows` | Presente en los workflows |

Un control sin verificación ejecutable no se considera cumplido.