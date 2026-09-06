# Aportación de Juan Andrés — Semana 1

**Estudiante:** 3523110131 · **Cuenta GitHub:** JAndres-MGonzalez.

## Explicación sencilla para presentar

Elegí cambiar temporalmente el título de la aplicación para provocar un error fácil de comprobar. La prueba buscaba el texto exacto `CampusOps`, pero la aplicación mostraba `CampusOps - falla controlada`; por eso falló. Al restaurar `CampusOps`, la misma prueba volvió a pasar.

El **síntoma** fue el mensaje que decía que no se encontraba `CampusOps`. La **causa** fue haber cambiado el título. La **corrección** consistió en restaurar ese texto, sin cambiar la prueba. El backend simulado seguía disponible, así que no era la causa del problema.

Codex ayudó a preparar el proyecto, ejecutar las comprobaciones y documentar los resultados. Las salidas ya guardadas corresponden a esa ejecución asistida; la comprobación personal todavía está pendiente.

## Aportación respaldada por esta sesión

Juan Andrés eligió cambiar temporalmente el título de la aplicación para provocar una falla en la prueba smoke y restaurarlo después. También solicitó preparar CampusOps y crear su repositorio separado. La instalación, los cambios, las ejecuciones, la redacción y los commits se realizaron mediante Codex en su entorno, bajo su cuenta Git, con asistencia declarada.

El alcance de esta aportación es la preparación y el diagnóstico de la línea base. No se presenta como una implementación de las funciones completas de CampusOps.

## Commits y archivos

- `19c9611e0847248d1d1d342a4b9cf26f8d0a2cef`: incorporación del starter y de los logs de instalación y comprobación originales.
- `1cfab5a5d06dab6f55d6c824a8f2f7d3daae8a21`: documentación técnica; el plan y la interpretación de la falla están en `docs/diagnostico-semana-01.md` y los criterios observables en `docs/problem-definition.md`.
- `cae15ba0c77974d21f1f1faceb2e8f0f9582fafd`: registro de salidas, hashes e índices de evidencia compartida del diagnóstico.

Los commits existen y su autor Git es `JAndres-MGonzalez`. Ese dato acredita la cuenta usada para guardar el trabajo asistido; por sí solo no demuestra una prueba realizada manualmente por el estudiante.

## Predicción del plan previo

La prueba busca el texto exacto `CampusOps`. Si `App.tsx` muestra `CampusOps - falla controlada`, se espera que falle esa consulta. Al restaurar `CampusOps`, se espera que la misma prueba vuelva a pasar, conservando el backend simulado en `available`.

Esta predicción figura en el plan elaborado con asistencia antes del experimento. La explicación sencilla de arriba se redactó a petición del estudiante para que pueda comprenderla y explicarla; no se presenta como una explicación que él ya haya dado ni como evidencia de una ejecución manual.

## Resultados de la ejecución asistida

Comando en ambos casos: `npm run test:smoke`.

| Estado | Resultado real | Evidencia |
|---|---|---|
| Título alterado | Código 1; una suite y una prueba fallidas. Mensaje: `Unable to find an element with text: CampusOps`. | `reports/week-01/logs/smoke-failure.log` |
| Título restaurado | Código 0; una suite y una prueba aprobadas. | `reports/week-01/logs/smoke-corrected.log` |

El síntoma es que la prueba no encuentra el título esperado. La causa es el cambio del literal en `App.tsx`; el árbol del fallo muestra que el backend simulado ya estaba `available`. Restaurar el literal corrige esa causa. `reports/week-01/diagnostic-observations.json` conserva los hashes que verifican la restauración y la integridad de los tests.

La prueba usa un doble de `getBackendHealth`: no comprueba conectividad real, sesión, permisos ni sincronización.

## Comprobación personal pendiente

En PowerShell, desde la raíz de este proyecto y en esta computadora:

```powershell
. "$env:USERPROFILE\.cache\campusops-tools\activate.ps1"
npm run test:smoke
```

Guardar la salida real y explicar por qué el texto alterado no coincidía con lo que esperaba la prueba. Si el resultado es distinto, registrar ese resultado y diagnosticarlo; no copiar el resultado de la ejecución asistida.

Hasta recibir esta comprobación o una revisión técnica personal verificable, `tests` y `reviews` del registro individual se mantienen vacíos. El registro está preparado, pero todavía no satisface el requisito personal del paso 12 de `LEEME_PRIMERO.md`.
