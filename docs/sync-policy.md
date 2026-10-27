# Política de sincronización — Semana 8

## Comparación y combinación

`resolveSync` delega en la lógica real de `src/infrastructure/sync/resolve.ts`.
La comparación JSON ordena las claves de objetos recursivamente; el orden de
los arreglos sí forma parte de su contenido. No modifica las entradas.

| Cambio respecto a la base | Resultado |
|---|---|
| Sólo cambió local | Conservar el cambio local. |
| Sólo cambió remoto | Conservar el cambio remoto. |
| Ambos tienen el mismo valor | Conservar ese valor. |
| Ambos tienen valores distintos | Informar los campos incompatibles ordenados por nombre. |

`work` agrupa estado y técnico en las pruebas. El inicio local y la reasignación
remota son incompatibles: se devuelve conflicto sin modificar los tres registros.
La política exige conservar la intención local y la nueva asignación hasta su
revisión; nunca imponer al técnico anterior.

## Identidad y cola

`operationId` identifica la intención y se conserva en cada intento junto con el
contenido y la versión base. `deduplicateOperations` conserva la primera
aparición. La cola también conserva el primer registro y serializa sus escrituras
para evitar pérdidas simultáneas.

El outbox acepta dos payloads: `{ action: 'create_incident', draft }` y
`{ action: 'start', note?, evidenceIds? }`. Ambos se envían con el mismo
`operationId` como clave de idempotencia. Si el envío devuelve un recurso, se
elimina la operación; un error o `null` la conserva como `failed`. `flush`
comparte una ejecución entre llamadas simultáneas.

Antes de enviar un `start`, `submitTechnicianStart` consulta la incidencia y
decide: si ya está `in_progress` para el mismo técnico, la considera confirmada;
si la asignación vigente es de otro técnico (o el servidor responde 403/404 al
consultarla) informa `reasignación`; si sólo cambió un campo independiente,
reenvía con la versión remota actual; si el estado ya avanzó, informa
`transición`. Un conflicto (`OutboxConflictError`) deja la operación `failed` en
la cola, la reporta en `conflicts` y nunca la retira ni sobrescribe al técnico
vigente. `baseVersion` sigue siendo el candado final del servidor: un 409 al
aplicar la acción conserva la operación para revisión.

Las notas y las `evidenceIds` viajan como metadatos de la operación y quedan en
la cola aunque el envío no se confirme. Una referencia de fotografía identifica
el recurso pendiente; no sube el archivo.

Una clave repetida no autoriza cambiar el contenido. El servidor debe rechazar
esa reutilización o devolver la confirmación anterior cuando sea el mismo cambio.
Una respuesta perdida no permite generar una identidad nueva ni descartar el
pendiente.

## Autorización y conflicto de reasignación

Se conservan las pruebas de sesión y autorización de semana 6. El técnico sólo
puede iniciar o resolver su incidencia asignada; coordinación puede reasignar,
cerrar o reabrir según el contrato. Guardar `author` en la cola no sustituye
comprobar los permisos vigentes en el servidor.

La aplicación permite iniciar sesión como reportante (`reporter-1`) o como
técnico (`technician-1`); el repositorio HTTP toma el actor vigente en cada
solicitud para que el servidor aplique sus permisos. El detalle de la incidencia
muestra versión y técnico asignado, y el botón «Iniciar atención» guarda primero
la operación en la cola (outbox-first): con o sin conexión el camino es el mismo
y sólo se retira cuando el servidor confirma.

La cola sobrevive a cerrar y abrir la app: al arrancar, `App.tsx` migra el
esquema si hace falta, recupera las operaciones y muestra `operationId`,
incidencia, nota, referencia de fotografía y estado, antes de que el usuario
vuelva a iniciar sesión.

## Evidencia y límites

Los casos, comandos y observaciones actuales están en
`reports/week-08/migration-tests.json`. El reporte de Ismael está en
`evidence/week-08/reports/3523110741.md`; registra sus ejecuciones anteriores y
reconoce el reinicio simulado y los límites de confirmación.

Las pruebas de outbox usan respuestas simuladas y memoria. Demuestran las reglas
de retiro, reintento y conflicto de creaciones e inicios de atención. La
evidencia nativa de cerrar y abrir la app real está en
`evidence/week-08/native/native-restart.md`, con capturas y el registro de
`adb`.
