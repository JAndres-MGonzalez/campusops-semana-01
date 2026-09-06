# Aportación de Juan Andrés — Semana 1

**Estudiante:** 3523110131 · **Cuenta GitHub:** JAndres-MGonzalez.

## Explicación sencilla para presentar

Elegí cambiar temporalmente el título de la aplicación para provocar un error fácil de comprobar. La prueba buscaba el texto exacto `CampusOps`, pero la aplicación mostraba `CampusOps - falla controlada`; por eso falló. Al restaurar `CampusOps`, la misma prueba volvió a pasar.

El **síntoma** fue el mensaje que decía que no se encontraba `CampusOps`. La **causa** fue haber cambiado el título. La **corrección** consistió en restaurar ese texto, sin cambiar la prueba. El backend simulado seguía disponible, así que no era la causa del problema.

Codex ayudó a preparar el proyecto, ejecutar el experimento y documentar los resultados. Después ejecuté personalmente `npm run test:smoke` desde la carpeta correcta y compartí la salida: una suite y una prueba aprobadas.

## Aportación respaldada por esta sesión

Juan Andrés eligió cambiar temporalmente el título de la aplicación para provocar una falla en la prueba smoke y restaurarlo después. También solicitó preparar CampusOps y crear su repositorio separado. La instalación, los cambios, las ejecuciones del experimento, la redacción y los commits se realizaron mediante Codex en su entorno, bajo su cuenta Git, con asistencia declarada. Posteriormente Juan Andrés ejecutó la prueba por su cuenta en PowerShell y compartió el resultado.

El alcance de esta aportación es la preparación y el diagnóstico de la línea base. No se presenta como una implementación de las funciones completas de CampusOps.

## Commits y archivos

- `19c9611e0847248d1d1d342a4b9cf26f8d0a2cef`: incorporación del starter y de los logs de instalación y comprobación originales.
- `1cfab5a5d06dab6f55d6c824a8f2f7d3daae8a21`: documentación técnica; el plan y la interpretación de la falla están en `docs/diagnostico-semana-01.md` y los criterios observables en `docs/problem-definition.md`.
- `cae15ba0c77974d21f1f1faceb2e8f0f9582fafd`: registro de salidas, hashes e índices de evidencia compartida del diagnóstico.
- `3fb4fddcf481e5cb6dfa0dec19e7ebbdd11ced29`: preparación de este apartado individual y su explicación sencilla, con asistencia de Codex.

Los commits existen y su autor Git es `JAndres-MGonzalez`. Ese dato acredita la cuenta usada para guardar el trabajo asistido; por sí solo no demuestra una prueba realizada manualmente por el estudiante.

## Predicción del plan previo

La prueba busca el texto exacto `CampusOps`. Si `App.tsx` muestra `CampusOps - falla controlada`, se espera que falle esa consulta. Al restaurar `CampusOps`, se espera que la misma prueba vuelva a pasar, conservando el backend simulado en `available`.

Esta predicción figura en el plan elaborado con asistencia antes del experimento. Antes de la repetición personal se indicó que, con el título ya restaurado, se esperaba `Tests: 1 passed, 1 total`. La explicación sencilla de arriba se redactó a petición del estudiante; la evidencia de su ejecución personal se registra por separado a continuación.

## Resultados de la ejecución asistida

Comando en ambos casos: `npm run test:smoke`.

| Estado | Resultado real | Evidencia |
|---|---|---|
| Título alterado | Código 1; una suite y una prueba fallidas. Mensaje: `Unable to find an element with text: CampusOps`. | `reports/week-01/logs/smoke-failure.log` |
| Título restaurado | Código 0; una suite y una prueba aprobadas. | `reports/week-01/logs/smoke-corrected.log` |

El síntoma es que la prueba no encuentra el título esperado. La causa es el cambio del literal en `App.tsx`; el árbol del fallo muestra que el backend simulado ya estaba `available`. Restaurar el literal corrige esa causa. `reports/week-01/diagnostic-observations.json` conserva los hashes que verifican la restauración y la integridad de los tests.

La prueba usa un doble de `getBackendHealth`: no comprueba conectividad real, sesión, permisos ni sincronización.

## Comprobación personal realizada

El estudiante compartió dos capturas de su terminal. En el primer intento ejecutó el comando desde `C:\Windows\system32`: npm no encontró `package.json` y mostró `ENOENT`. La prueba aún no había iniciado; ese error corresponde a la carpeta de trabajo, no a la falla controlada de CampusOps.

Después cambió a la carpeta del proyecto, activó el entorno y ejecutó:

```powershell
Set-Location -LiteralPath (Join-Path $env:USERPROFILE 'Documents\ChatGPT\Semana 01 — Diagnóstico reproducible y definición técnica')
. "$env:USERPROFILE\.cache\campusops-tools\activate.ps1"
npm run test:smoke
```

La segunda captura muestra:

```text
PASS course-tests/smoke.test.tsx
✓ renders the reproducible baseline and resolves backend state (116 ms)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.341 s
```

Se conservó la transcripción visible en `reports/week-01/logs/juan-andres-smoke-console.log`; se identifica como transcripción y no como una captura automática de stdout. Los logs locales de npm corroboran el mismo comando con Node 22.22.0, npm 10.9.4, la raíz de este proyecto como carpeta y salida 0. Sus extractos están en `reports/week-01/logs/juan-andres-npm-excerpts.log` y la procedencia en `reports/week-01/juan-andres-personal-check.json`.

`tests` de mi registro contiene `npm run test:smoke`. `reviews` permanece vacío porque no se declara una revisión personal adicional. La repetición personal confirma el estado corregido; la provocación y corrección anteriores siguen identificadas como ejecuciones asistidas. Esta comprobación no acredita por sí sola que los otros dos integrantes hayan realizado sus aportaciones.
