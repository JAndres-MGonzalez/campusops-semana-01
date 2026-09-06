# Estado de CampusOps — Semana 1

Repositorio público: https://github.com/JAndres-MGonzalez/campusops-semana-01

El trabajo técnico de esta sesión se preparó con asistencia de Codex. El usuario eligió la falla controlada del título. Los documentos contienen una propuesta específica de problema, alcance, actores, flujo, criterios y tres riesgos para que el equipo la revise y haga aportaciones propias.

## Evidencia disponible

- El starter se instaló con Node 22.22.0 y npm 10.9.4: 970 paquetes añadidos, salida 0 de `make setup`.
- `make feedback` pasó antes del experimento: TypeScript, lint, smoke, auditoría crítica y exportación Android. Los logs originales están en `reports/week-01/logs/`.
- La prueba original también pasó en GitHub Actions, en el workflow Starter Public Feedback del commit inicial.
- La falla del título produjo código 1 y el mensaje que identifica el texto ausente. Su corrección produjo código 0 con la misma prueba. Se conservan patch, logs, horas y hashes.
- `baseline.json` y `engineering.json` registran las observaciones de esta sesión y apuntan al commit técnico. No sustituyen evidencia individual.
- Juan Andrés repitió personalmente `npm run test:smoke` desde la carpeta del proyecto: una suite y una prueba aprobadas. Su registro está en `evidence/week-01/juan-andres.md`, con transcripción de la salida compartida y extractos sanitizados de los logs de npm.

La auditoría del entorno original reportó una vulnerabilidad **moderada** en `@xmldom/xmldom`. Pasar el umbral crítico configurado no significa tener cero vulnerabilidades. Se conservó el lockfile original y el resultado completo de la auditoría.

## Entorno local de Windows

Esta máquina tiene un Node global distinto del requerido. Se preparó Node 22.22.0 portable desde la [distribución oficial](https://nodejs.org/download/release/v22.22.0/), verificando su [SHA-256 publicado](https://nodejs.org/download/release/v22.22.0/SHASUMS256.txt). GNU Make 4.4.1 procede del [port para Windows](https://github.com/mbuilov/gnumake-windows).

Para usar las herramientas ya preparadas en **esta computadora**, abrir PowerShell en la raíz del proyecto y ejecutar:

```powershell
Set-Location -LiteralPath (Join-Path $env:USERPROFILE 'Documents\ChatGPT\Semana 01 — Diagnóstico reproducible y definición técnica')
. "$env:USERPROFILE\.cache\campusops-tools\activate.ps1"
node --version
npm --version
make --version
```

Si npm informa `ENOENT` y busca `package.json` en `C:\Windows\system32`, la terminal está en la carpeta incorrecta: cambiar a la raíz del proyecto y repetir el comando. Juan Andrés encontró ese error antes de ejecutar correctamente la smoke. El error de ubicación no se presenta como la falla controlada del título y no requiere modificar código ni pruebas.

La activación sólo afecta esa terminal. Las herramientas se guardan fuera del repositorio. Un lanzador local `npm.exe` invoca el npm oficial de Node 22.22.0, hereda la salida y devuelve su código de salida: esto permite que Python ejecute `npm` en Windows, donde el comando original no encontraba `npm.cmd`. El evaluador del curso sigue intacto. En otra máquina, instalar los requisitos y seguir `LEEME_PRIMERO.md`.

El workflow semanal descarga el historial completo con `fetch-depth: 0` para que el evaluador pueda comprobar el padre del commit exclusivo de evidencias y las etiquetas. Se mantienen todos los comandos y condiciones de evaluación.

## Pendiente antes de congelar

1. Confirmar el identificador del equipo y los identificadores escolares de los otros dos integrantes aplicables a CampusOps. El registro de Juan Andrés ya contiene su matrícula y su prueba personal; no se trasladaron pruebas de PWA.
2. Agregar a los otros dos integrantes como colaboradores usando sus cuentas reales.
3. Los otros dos integrantes deben hacer una aportación técnica, commit propio y prueba o revisión personal explicable. Registrar esos datos en `evidence/week-01/individual.json`; las ejecuciones de Codex no se atribuyen a estudiantes. Juan Andrés ya registró sus commits de trabajo asistido y repitió personalmente la prueba del proyecto corregido.
4. Después de cualquier cambio técnico o documental, obtener un nuevo SHA y actualizar las dos evidencias según los pasos 9–12 de `LEEME_PRIMERO.md`.
5. Sólo cuando desaparezcan los pendientes y las verificaciones pasen, seguir los pasos 13–17 para el commit exclusivo de evidencias, la etiqueta `week-01-final`, el reporte posterior a la etiqueta y la publicación.

El repositorio contiene un avance; todavía no constituye la entrega congelada. No hay una etiqueta final ni un SHA listo para copiar en Classroom. Un fallo de validación por evidencia individual pendiente debe resolverse con aportaciones reales.
