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