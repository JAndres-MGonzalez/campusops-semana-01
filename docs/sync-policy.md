# Política de sincronización — Semana 8

## Regla de combinación

`resolveSync` delega en `src/infrastructure/sync/resolve.ts` y compara cada campo
local y remoto contra una base común.

| Cambio observado | Resultado |
|---|---|
| Sólo cambió local | Conservar el valor local. |
| Sólo cambió remoto | Conservar el valor remoto. |
| Ambos tienen el mismo valor | Conservar ese valor. |
| Ambos cambiaron el campo a valores distintos | Informar el conflicto con los nombres de campos ordenados. |

La función no modifica las entradas. Actualmente compara mediante
`JSON.stringify`; objetos con iguales propiedades en diferente orden producen un
conflicto falso. Ese límite se reproduce en `evidence/week-08/review.test.ts`.

## Inicio sin conexión y reasignación

En las pruebas, `work` agrupa estado y técnico asignado. El inicio local de
atención y la reasignación remota cambian ese campo de manera incompatible.
La función devuelve `{ kind: 'conflict', fields: ['work'] }` sin cambiar los tres
registros recibidos.

La política es conservar la nueva asignación y mantener la intención local
pendiente, mostrando el conflicto para revisión. No se debe enviar el inicio
antiguo como si el técnico siguiera asignado. Esta versión tiene el cálculo del
conflicto, pero no su presentación ni su resolución conectadas a la app.

## Identidad y reintentos

Cada intención debe conservar el mismo `operationId`, autor, contenido y versión
base durante sus reintentos. El encabezado `Idempotency-Key` debe reutilizar esa
identidad. Reutilizar una clave con otro contenido no es una operación válida.

`deduplicateOperations` conserva la primera aparición por `operationId` y no
modifica el arreglo original. Sin embargo, `enqueue` reemplaza la operación
anterior; falta hacer coherentes ambos comportamientos y evitar pérdidas ante
escrituras simultáneas.

## Confirmación y retiro

`markFailed` conserva el elemento. `markInFlight` registra el intento.
La cola expone `remove`, pero todavía no existe un flujo de envío que compruebe
la confirmación antes de llamarlo. Tener un método para borrar no demuestra esa
regla.

Sólo una respuesta confirmada permite retirar la operación. Un timeout, una
respuesta de error o un conflicto deben conservarla. Si se pierde una respuesta
cuando el servidor ya aplicó el cambio, el reintento debe usar la misma clave y
producir un solo efecto. Esa comprobación con la cola y el backend sigue pendiente.

## Autorización

Se conservan los controles de sesión de la semana 6 y sus pruebas. El reportante
crea sus incidencias; el técnico inicia o resuelve una incidencia que tiene
asignada; coordinación asigna, reasigna, cierra o reabre según el contrato.

La futura sincronización debe comprobar el actor y la asignación vigentes antes
de enviar. Guardar `author` en la cola no sustituye la validación del servidor.
Un conflicto no autoriza omitir una respuesta `403` o `409` ni imponer un estado
antiguo.

## Evidencia

`reports/week-08/migration-tests.json` diferencia los casos aprobados, los fallos
reproducidos y los flujos aún sin comprobar. Las salidas están en
`evidence/week-08/logs/integration-tests.log`.

Pasaron las tres pruebas públicas de sincronización y los cinco casos del núcleo
de Kevin. Los tres casos adicionales de revisión fallaron. La deduplicación de un
arreglo no demuestra por sí sola idempotencia del servidor, y reconstruir un
objeto de cola en memoria no demuestra persistencia al reiniciar la app.
