# Definición del problema — CampusOps

CampusOps se construirá por etapas. En Semana 1 se define el problema y se comprueba el proyecto inicial; las funciones del producto se implementarán en los siguientes hitos.

## Problema

En el campus ficticio, una fuga en un laboratorio o una falla eléctrica puede reportarse varias veces y perder seguimiento si el reportante, el técnico y la coordinación no comparten el estado de la incidencia. Sin una asignación e historial consultables, un mismo problema puede generar varios reportes duplicados, quedar sin técnico responsable durante días, o cerrarse sin que quien lo reportó sepa qué se hizo. CampusOps organizará ese seguimiento con incidencias identificables, responsabilidades separadas y un historial que cualquier actor autorizado pueda consultar.

## Alcance

### Incluye

- Registrar incidencias sintéticas con categoría, descripción y ubicación; consultar lista, detalle y reportes propios según el perfil.
- Priorizar y asignar técnicos, iniciar atención, registrar diagnóstico y evidencias, resolver, cerrar y reabrir conservando historial.
- Como alcance acumulativo: sesión por perfil, notas y fotografías de prueba, consulta local, cola persistente y sincronización con detección de conflictos e idempotencia.
- Incorporar posteriormente un servicio de mapas o geocodificación con ubicación manual como alternativa. Android será la plataforma de referencia.
- En Semana 1, el alcance se limita a lo descrito en "Criterios de aceptación verificables": comprobar el starter, definir el caso y tres riesgos, y reproducir/corregir una regresión controlada.

### No incluye

- Construir en Semana 1 el login, todas las pantallas o los adaptadores reservados para semanas posteriores.
- Usar datos de instalaciones reales, personas, credenciales institucionales o servicios de emergencias; desplegar el backend sintético como servicio institucional.
- Pagos, chat en tiempo real, reconocimiento de imágenes, panel web administrativo completo y publicación obligatoria en tiendas.
- Navegación, seguimiento continuo y mapas offline completos. Push e iOS son extensiones voluntarias fuera del mínimo.

## Actores y matriz de permisos

La tabla anterior solo describía responsabilidades en prosa; esta matriz fija qué acción puede ejecutar cada actor, para que un evaluador o un desarrollador de un hito futuro no tenga que inferirlo del texto.

| Acción sobre la incidencia | Reportante | Técnico | Coordinador |
|---|:---:|:---:|:---:|
| Crear incidencia | Sí | No | No |
| Ver sus propias incidencias | Sí | — | — |
| Ver incidencias asignadas a él | — | Sí | — |
| Ver todas las incidencias | No | No | Sí |
| Priorizar / asignar técnico | No | No | Sí |
| Iniciar atención (`assigned` → `in_progress`) | No | Sí (solo si es el asignado) | No |
| Registrar diagnóstico/evidencias | No | Sí (solo si es el asignado) | No (solo revisa) |
| Marcar `resolved` | No | Sí (solo si es el asignado) | No |
| Cerrar (`resolved`/`closed` → `closed`) | No | No | Sí |
| Reabrir (`resolved`/`closed` → `assigned`) | No | No | Sí (requiere técnico asignado) |

Un reportante que intente asignar o cerrar, o un técnico que intente actuar sobre una incidencia que no tiene asignada, debe recibir un rechazo explícito del servicio — no solo una interfaz que oculte el botón. Esto es lo que ya anotaba el texto original ("la autorización se comprueba en el servicio"); la matriz lo hace verificable acción por acción en vez de como una sola frase general.

## Flujo principal

1. Reportar: el reportante registra categoría, descripción y ubicación; se crea un identificador y el estado `open`.
2. Asignar: coordinación establece prioridad y técnico responsable; el estado pasa a `assigned` y queda historial de la asignación.
3. Atender: el técnico asignado inicia con `in_progress`, registra diagnóstico y evidencias, y marca `resolved`. Si trabajó sin conexión, la sincronización valida autor y versión; conserva los cambios pendientes cuando hay conflicto.
4. Cerrar: coordinación revisa la resolución y cambia a `closed`. Si requiere más atención, puede reabrir un caso resuelto/cerrado a `assigned` cuando tenga técnico asignado. Resolver y cerrar son eventos distintos.

## Criterios de aceptación verificables

Cada criterio indica si aporta al puntaje automático de **Reproducción** (2.5 pts, esta semana) o solo al de **Definición del caso** (2.0 pts, especificado ahora, verificado en hitos futuros).

| # | Condición observable | Cómo se comprueba | Cuenta para |
|---|---|---|---|
| 1 | Con Node 22.22.0 y el lockfile dado, `make setup` y `make feedback` terminan en código 0 (TypeScript, lint, smoke, `npm audit --omit=dev --audit-level=critical`, bundle Android). | Ejecutar los comandos y revisar el código de salida y los logs guardados en `reports/week-01/`. | Reproducción |
| 2 | Con el doble determinista del backend, `npm run test:smoke` encuentra el título exacto `CampusOps` y el estado `available`. | `npm run test:smoke`, revisar salida PASS. | Reproducción |
| 3 | Al cambiar el título a `CampusOps - falla controlada`, el mismo comando falla por no encontrar `CampusOps`; al restaurarlo, vuelve a pasar sin tocar la prueba. | Diff del cambio + logs de fallo y de corrección. | Reproducción |
| 4 | Un checkout nuevo del mismo commit (o CI) reproduce el resultado de 1–3 sin pasos manuales fuera de `LEEME_PRIMERO.md`. Esto cierra el riesgo 1 del registro de riesgos. | Clonar en limpio, repetir 1–3. | Reproducción |
| 5 | Un reportante que intenta asignar o cerrar una incidencia (vía API, no solo UI) recibe rechazo del servicio, según la matriz de permisos. | Prueba futura contra el endpoint de asignación/cierre con rol reportante. | Definición del caso |
| 6 | Coordinación asigna un técnico a una incidencia `open`; el detalle refleja `assigned`, el responsable y un evento de historial. | Prueba futura: asignar y verificar detalle + historial. | Definición del caso |
| 7 | El técnico asignado resuelve (`resolved`); solo el cierre posterior de coordinación produce `closed`, con eventos distinguibles en el historial. | Prueba futura: dos eventos separados y verificables. | Definición del caso |
| 8 | Un técnico offline reasignado por coordinación no sobrescribe silenciosamente la reasignación al sincronizar; el conflicto se informa y la intención local queda recuperable. | Prueba futura: escenario de conflicto descrito en el riesgo 2. | Definición del caso |
| 9 | Reintentar una resolución con la misma clave de idempotencia y el mismo contenido produce una sola operación efectiva; la misma clave con otro contenido se rechaza. | Prueba futura: simular timeout y reintento, descrito en el riesgo 3. | Definición del caso |

La prueba smoke de Semana 1 usa un doble de `getBackendHealth` y solo acredita los criterios 1–4. No acredita conectividad real, autorización ni persistencia: los criterios 5–9 necesitan pruebas propias en los hitos donde se implementen esas funciones.