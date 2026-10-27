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

El outbox actualmente sólo acepta payloads `create_incident`. Las creaciones se
envían con el mismo `operationId` como clave de idempotencia. Si el envío devuelve
un recurso, se elimina la operación; un error o `null` la conserva como `failed`.
`flush` comparte una ejecución entre llamadas simultáneas.

Una clave repetida no autoriza cambiar el contenido. El servidor debe rechazar
esa reutilización o devolver la confirmación anterior cuando sea el mismo cambio.
Una respuesta perdida no permite generar una identidad nueva ni descartar el
pendiente.

## Autorización y conflicto de reasignación

Se conservan las pruebas de sesión y autorización de semana 6. El técnico sólo
puede iniciar o resolver su incidencia asignada; coordinación puede reasignar,
cerrar o reabrir según el contrato. Guardar `author` en la cola no sustituye
comprobar los permisos vigentes en el servidor.

La aplicación actual sólo inicia sesión como reportante y conecta el outbox con
`repository.create`. No consulta la nueva versión ni envía `start` por
`POST /v1/incidents/:id/actions`. Una operación de atención en la cola no es una
creación válida para ese outbox: queda marcada como fallida sin enviarse.

Por eso el conflicto calculado por `resolveSync` aún no demuestra el caso
obligatorio de técnico sin conexión frente a reasignación remota en el flujo de
sincronización. Debe integrarse ese envío, conservar la intención y mostrar la
resolución sin sobrescribir la asignación.

## Evidencia y límites

Los casos, comandos y observaciones actuales están en
`reports/week-08/migration-tests.json`. El reporte de Ismael está en
`evidence/week-08/reports/3523110741.md`; registra sus ejecuciones anteriores y
reconoce el reinicio simulado y los límites de confirmación.

Las pruebas de outbox usan respuestas simuladas y memoria. Demuestran las reglas
de retiro y reintento de creaciones, pero no prueban por sí solas idempotencia del
servidor con respuestas perdidas ni cerrar y volver a abrir la app nativa.
