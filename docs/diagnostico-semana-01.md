# Plan del diagnóstico — Semana 1

La falla elegida consiste en cambiar temporalmente el título de la aplicación. El plan establece el cambio, el resultado esperado y la forma de restaurarlo. Las salidas y la procedencia de las ejecuciones están en `reports/week-01/diagnostic-observations.json`.

## Estado de partida

- El proyecto original del ZIP pasó `make setup` y `make feedback` con Node 22.22.0 y npm 10.9.4.
- Las salidas se conservan en `reports/week-01/logs/setup-original.log` y `reports/week-01/logs/feedback-original.log`.
- El commit inicial del starter es `19c9611e0847248d1d1d342a4b9cf26f8d0a2cef`.

## Experimento elegido

1. Archivo: `App.tsx`; sólo se modifica el texto de `<Text style={styles.title}>`.
2. Cambio temporal: sustituir `CampusOps` por `CampusOps - falla controlada`.
3. Detección: ejecutar exactamente `npm run test:smoke`.
4. Predicción: una suite y una prueba fallan; `getByText('CampusOps')` no encuentra el texto exacto.
5. Corrección: restaurar los bytes originales de `App.tsx` y repetir exactamente `npm run test:smoke`; debe pasar una suite y una prueba.

El experimento sólo altera texto local, usa datos sintéticos y el doble de salud existente. No requiere red, credenciales ni arrancar el backend real durante la prueba. No se alteran pruebas, configuración de Jest, evaluador ni umbrales.

## Evidencia que se conservará

- `reports/week-01/logs/smoke-failure.log`: salida de la ejecución defectuosa.
- `reports/week-01/logs/smoke-corrected.log`: salida del mismo comando después de restaurar.
- `reports/week-01/diagnostic-observations.json`: horas, códigos de salida y hashes antes/después de aplicación y pruebas.
- `reports/week-01/baseline.json`: índice de síntoma, causa y corrección, con el SHA técnico obtenido después de completar los documentos.

## Interpretación y límite

El síntoma esperado es la ausencia del título exacto en la consulta de la prueba. La causa prevista es la sustitución del literal de `App.tsx`, no una caída del backend: el test suministra un doble determinista de su respuesta. Sólo las salidas ejecutadas permiten confirmar estas predicciones.

La comprobación de esta pantalla no demuestra que las funciones de incidencias, sesión, permisos o sincronización ya existan.

## Resultado observado

El 6 de septiembre de 2026, la ejecución defectuosa terminó a las 01:00:46 (UTC−06:00) con código 1, una suite fallida y una prueba fallida. El mensaje fue `Unable to find an element with text: CampusOps`; el árbol renderizado mostraba `CampusOps - falla controlada` y el backend simulado en `available`.

Tras restaurar el archivo, el mismo comando terminó a las 01:00:49 con código 0, una suite y una prueba aprobadas. El hash SHA-256 de `App.tsx` antes y después coincide. También coinciden los hashes de todos los tests, el evaluador, `package.json` y el lockfile; véase `diagnostic-observations.json`.
