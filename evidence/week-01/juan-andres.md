# Aportación de Juan Andrés — Semana 1

**Nombre:** Medina González Juan Andrés · **Matrícula:** 3523110131 · **Equipo:** 9A-E08 · **Cuenta GitHub:** JAndres-MGonzalez.

## Aportación

Elegí cambiar temporalmente el título de la aplicación para provocar una falla controlada. Después ejecuté `npm run test:smoke` en mi computadora para comprobar que el proyecto corregido pasara la prueba.

## Diagnóstico

La prueba buscaba el texto exacto `CampusOps`, pero la aplicación mostraba `CampusOps - falla controlada`; por eso falló. Al restaurar el título original, la misma prueba volvió a pasar.

- **Síntoma:** apareció el mensaje `Unable to find an element with text: CampusOps`.
- **Causa:** el título de `App.tsx` ya no coincidía con el texto que buscaba la prueba.
- **Corrección:** restaurar `CampusOps`, sin cambiar la prueba.

El backend simulado seguía en `available`, por lo que el error correspondía al título.

## Resultado esperado

Con el título cambiado, la prueba debía fallar. Con `CampusOps` restaurado, debía encontrar el texto, comprobar `available` y mostrar una prueba aprobada.

## Comprobación personal

Al principio ejecuté el comando desde `C:\Windows\system32` y apareció `ENOENT` porque npm no encontraba `package.json`. Cambié a la carpeta del proyecto, activé el entorno y repetí:

```powershell
Set-Location -LiteralPath (Join-Path $env:USERPROFILE 'Documents\ChatGPT\Semana 01 — Diagnóstico reproducible y definición técnica')
. "$env:USERPROFILE\.cache\campusops-tools\activate.ps1"
npm run test:smoke
```

Obtuve este resultado:

```text
PASS course-tests/smoke.test.tsx
✓ renders the reproducible baseline and resolves backend state (116 ms)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.341 s
```

Los logs de npm confirman Node 22.22.0, npm 10.9.4 y salida 0. El error de carpeta ocurrió antes de iniciar la prueba y es distinto de la falla controlada del título.

## Evidencia y commits

- `1cfab5a5d06dab6f55d6c824a8f2f7d3daae8a21`: plan y diagnóstico en `docs/diagnostico-semana-01.md`; criterios de aceptación en `docs/problem-definition.md`.
- `cae15ba0c77974d21f1f1faceb2e8f0f9582fafd`: salidas del fallo y de la corrección en `reports/week-01/logs/smoke-failure.log` y `smoke-corrected.log`.
- `3a07ceecc94fd4a7762d7b489f51602a91b5cc48`: prueba personal registrada en `reports/week-01/juan-andres-personal-check.json`, con transcripción de la salida y extractos de npm.

`reports/week-01/diagnostic-observations.json` conserva la procedencia del experimento y los hashes que comprueban que las pruebas no cambiaron. `reports/week-01/juan-andres-personal-check.json` documenta mi repetición del proyecto corregido.

La prueba revisa el título y una respuesta simulada de `getBackendHealth`. No comprueba conexión real, inicio de sesión, permisos ni sincronización.
