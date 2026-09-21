# Modelo de amenazas — CampusOps (equipo 9A-E08, Semana 3)

Este documento describe qué protege CampusOps (activos), dónde cambia el nivel de confianza (fronteras), qué amenazas se priorizan, qué control reduce cada una y qué verificación ejecutable demuestra que el control funciona. Todos los datos de ejemplo y de prueba son ficticios.

## 1. Activos (asset)

| id | activo | por qué se protege |
|---|---|---|
| A1 | credenciales y secretos de CI (tokens, claves) | dan acceso al repositorio y a servicios del proyecto |
| A2 | incidencias | cada usuario solo debe ver las que le corresponden |
| A3 | asignaciones y expedientes | su integridad decide quién atiende qué |
| A4 | datos sensibles: sesiones, fotografías y ubicaciones | su filtración expone a las personas usuarias |
| A5 | código fuente | su integridad evita cambios no revisados |

## 2. Fronteras de confianza (trust boundary)

| id | frontera | dónde cambia la confianza |
|---|---|---|
| B1 | GitHub Actions / secretos de CI | el workflow lee secretos que no deben salir a los registros |
| B2 | aplicación móvil (Expo) / API | todo lo que llega del cliente es no confiable |
| B3 | API / almacenamiento de datos | la API decide qué registros puede leer o escribir cada rol |
| B4 | API / registros (logs) | lo que se escribe en registros sale del control de la aplicación |

## 3. Priorización de amenazas

Escala: alta = 3, media = 2, baja = 1. Fórmula: **riesgo = impacto × probabilidad**. Las amenazas se ordenan de mayor a menor riesgo.

| prioridad | id | amenaza | probabilidad | impacto | riesgo |
|---|---|---|---|---|---|
| 1 | T1 | exponer credenciales en CI | alta (3) | alta (3) | 9 |
| 2 | T2 | consultar incidencias ajenas | media (2) | alta (3) | 6 |
| 3 | T3 | alterar asignaciones o expedientes | media (2) | media (2) | 4 |
| 4 | T4 | filtrar datos sensibles en registros | baja (1) | alta (3) | 3 |

**Justificación:** T1 va primero porque un secreto expuesto compromete al resto de los activos, se materializa con un simple descuido (un `echo` o un archivo subido por error) y es la amenaza que el propio CI puede detectar y hacer fallar. T2 sigue porque rompe la confidencialidad entre usuarios. T3 afecta la integridad, pero exige una sesión válida. T4 tiene menor probabilidad si se revisa qué se registra, aunque su impacto sería alto.

## 4. Amenazas, controles y verificación

### amenaza T1: exponer credenciales en CI (riesgo 9)

| activo | frontera | amenaza | control | verificación |
|---|---|---|---|---|
| A1 credenciales y secretos de CI | B1 GitHub Actions / secretos | un secreto se imprime o se sube al repositorio y queda expuesto en los registros | permisos mínimos del workflow (`contents: read`); ningún paso oculta fallos (sin `continue-on-error` ni ignorar códigos de salida); los secretos no se escriben en el código ni en los registros | `npm test -- course-tests/public/week-03.test.ts` comprueba el mínimo privilegio y que no se oculten fallos; `Select-String -Path .github\workflows\week-03-ci-amenazas-feedback.yml -Pattern "contents: read"` debe encontrar el permiso y con `-Pattern "continue-on-error"` no debe devolver resultados; el paso AC-03 del workflow (`make evidence-week-03`) conserva la evidencia de la falla declarada |

**Riesgo residual:** un secreto podría escribirse por descuido en el código o en un registro sin que ningún paso lo detecte; se mantiene revisión humana en cada pull request.

### amenaza T2: consultar incidencias ajenas (riesgo 6)

| activo | frontera | amenaza | control | verificación |
|---|---|---|---|---|
| A2 incidencias | B2 aplicación móvil / API y B3 API / almacenamiento | una persona usuaria consulta incidencias que no le pertenecen | se filtra por propietario y rol antes de mostrar o devolver una incidencia | `npm test` y `npm run test:smoke` deben pasar; la prueba de acceso por propietario con datos ficticios está pendiente de añadir (riesgo residual) |

**Riesgo residual:** la regla de acceso por propietario aún no tiene una prueba específica; se añadirá con datos ficticios.

### amenaza T3: alterar asignaciones o expedientes (riesgo 4)

| activo | frontera | amenaza | control | verificación |
|---|---|---|---|---|
| A3 asignaciones y expedientes | B2 aplicación móvil / API y B3 API / almacenamiento | se modifica una asignación sin permiso o con datos inválidos | validación de rol y de tipos (TypeScript) en cada operación de escritura | `npm run typecheck` (`tsc --noEmit`) rechaza tipos inválidos y `npm test` debe pasar |

**Riesgo residual:** un rol legítimo podría alterar una asignación por error; se conserva historial de cambios para auditarlo.

### amenaza T4: filtrar datos sensibles en registros (riesgo 3)

| activo | frontera | amenaza | control | verificación |
|---|---|---|---|---|
| A4 sesiones, fotografías y ubicaciones | B4 API / registros | un dato sensible se escribe en un registro o consola | no se registran datos sensibles, solo identificadores ficticios; el estilo y las pruebas revisan el código | `git grep -n console -- src` no debe mostrar datos sensibles; `npm run lint` y `npm test` deben pasar |

**Riesgo residual:** un desarrollador podría registrar un dato nuevo sin advertirlo; se revisa en cada pull request.

## 5. Resumen de verificación

- `npm run typecheck`, `npm run lint`, `npm test` y `npm run test:smoke`: comprobaciones locales reproducibles del proyecto (scripts de `package.json`).
- `npm test -- course-tests/public/week-03.test.ts`: prueba pública que valida el workflow (mínimo privilegio, sin ocultar fallos) y que este documento enlaza activo, amenaza, control y verificación.
- Workflow `Week 03 Academic Feedback`: pasos AC-01 (`make verify-week-03`), AC-02 (`make public-test-week-03`) y AC-03 (`make evidence-week-03`) en GitHub Actions.
- Cada control de este documento tiene una verificación asociada; una amenaza sin verificación no se considera cubierta.
