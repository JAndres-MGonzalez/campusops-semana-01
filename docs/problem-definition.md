# Definición del problema — CampusOps

Propuesta preparada con asistencia de Codex para revisión del equipo. Los comportamientos del producto se definen aquí; su implementación es progresiva y no se afirma que ya exista en Semana 1.

## Problema

En el campus ficticio, una fuga en un laboratorio o una falla eléctrica puede reportarse varias veces y perder seguimiento si el reportante, el técnico y la coordinación no comparten el estado de la incidencia. Sin una asignación e historial consultables, resulta difícil saber quién debe atenderla, qué acciones se realizaron y quién confirmó el cierre. CampusOps organizará ese seguimiento con incidencias identificables y responsabilidades separadas.

## Alcance

### Incluye

- Registrar incidencias sintéticas con categoría, descripción y ubicación; consultar lista, detalle y reportes propios según el perfil.
- Priorizar y asignar técnicos, iniciar atención, registrar diagnóstico y evidencias, resolver, cerrar y reabrir conservando historial.
- Como alcance acumulativo: sesión por perfil, notas y fotografías de prueba, consulta local, cola persistente y sincronización con detección de conflictos e idempotencia.
- Incorporar posteriormente un servicio de mapas o geocodificación con ubicación manual como alternativa. Android será la plataforma de referencia.
- En Semana 1: comprobar el starter con Node 22.22.0 y el lockfile suministrado; definir el caso y tres riesgos; reproducir y corregir una regresión del título con la prueba smoke existente; registrar comandos y resultados.

### No incluye

- Construir en Semana 1 el login, todas las pantallas o los adaptadores reservados para semanas posteriores.
- Usar datos de instalaciones reales, personas, credenciales institucionales o servicios de emergencias; desplegar el backend sintético como servicio institucional.
- Pagos, chat en tiempo real, reconocimiento de imágenes, panel web administrativo completo y publicación obligatoria en tiendas.
- Navegación, seguimiento continuo y mapas offline completos. Push e iOS son extensiones voluntarias fuera del mínimo.

## Actores y responsabilidades

- **Reportante:** crear la incidencia con datos sintéticos suficientes para localizarla; consultar sus reportes y aportar información posterior. No asigna técnicos ni cierra la resolución.
- **Técnico:** consultar lo que tiene asignado, iniciar atención, conservar diagnóstico/notas/evidencias y marcar la resolución. Puede preparar cambios sin conexión; una reasignación remota impide aplicar silenciosamente su cambio anterior.
- **Coordinador:** revisar el conjunto, priorizar, asignar o reasignar, revisar evidencias y cerrar o reabrir. La autorización se comprueba en el servicio además de limitar las acciones visibles en la interfaz.

## Flujo principal

1. Reportar: el reportante registra categoría, descripción y ubicación; se crea un identificador y el estado `open`.
2. Asignar: coordinación establece prioridad y técnico responsable; el estado pasa a `assigned` y queda historial de la asignación.
3. Atender: el técnico asignado inicia con `in_progress`, registra diagnóstico y evidencias, y marca `resolved`. Si trabajó sin conexión, la sincronización valida autor y versión; conserva los cambios pendientes cuando hay conflicto.
4. Cerrar: coordinación revisa la resolución y cambia a `closed`. Si requiere más atención, puede reabrir un caso resuelto/cerrado a `assigned` cuando tenga técnico asignado. Resolver y cerrar son eventos distintos.

## Criterios de aceptación verificables

### Línea base comprobable esta semana

1. Con Node 22.22.0 y las dependencias del lockfile, `make setup` y `make feedback` terminan con código 0; feedback incluye TypeScript, lint, smoke, auditoría con umbral crítico y bundle Android.
2. Al renderizar la pantalla con el doble de salud del backend suministrado, `npm run test:smoke` encuentra el título exacto `CampusOps` y el estado `available`.
3. Si únicamente se cambia el texto del título a `CampusOps - falla controlada`, el mismo comando falla porque no encuentra `CampusOps`. Al restaurar el texto, vuelve a pasar sin cambios en las pruebas.

### Comportamientos que se implementarán en los siguientes hitos

4. Dada una incidencia `open`, cuando coordinación asigna un técnico, el detalle refleja `assigned`, el responsable y un evento de historial; un reportante no puede efectuar esa asignación.
5. Dada una incidencia `in_progress` del técnico, resolver produce `resolved`; únicamente el cierre posterior de coordinación produce `closed`, con eventos distinguibles.
6. Si un técnico inicia atención sin conexión y coordinación reasigna la incidencia, sincronizar conserva la nueva asignación, informa el conflicto y mantiene recuperable la intención local.
7. Si se pierde la respuesta después de guardar una resolución, reintentar con la misma clave y contenido produce una sola operación efectiva. La misma clave con otro contenido se rechaza.

La prueba smoke usa un doble determinista de `getBackendHealth`. Su resultado no acredita conectividad real, autorización, persistencia ni los criterios 4–7. Esos criterios deberán tener sus propias pruebas en los hitos correspondientes.
