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
