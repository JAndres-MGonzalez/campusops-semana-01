# Modelo de datos local — Semana 8

## Entidades y relaciones

| Entidad | Contenido y relación |
|---|---|
| Incidencia | Documento JSON en `campusops.data.incidents`. Sus operaciones la referencian mediante `incidentId`. |
| Actor | `author` identifica al actor sintético de la operación; la cola no guarda credenciales. |
| Operación pendiente | `operationId`, `incidentId`, `author`, `payload`, `baseVersion`, `createdAt`, `status`, `attempts` e `idempotencyKey` opcional, en `campusops.queue.pending`. |
| Versión de esquema | Entero en `campusops.schema.version`; `SCHEMA_VERSION = 1`. |
| Respaldo de migración | Versión, incidencias, cola y fecha anteriores, en `campusops.migration.snapshot`. |

Una incidencia puede tener varias operaciones. Cada operación conserva su autor
y su versión base. Una referencia de fotografía identifica un recurso pendiente;
no demuestra que el archivo ya esté almacenado o enviado.

## Almacenamiento y cola

`createDurableStorage` utiliza AsyncStorage 3.1.1 y recurre a memoria si no puede
cargar el módulo. En Jest se utiliza el sustituto oficial desde `jest.setup.js`.
Ese sustituto permite probar la lógica y no acredita almacenamiento nativo.

Las mutaciones de cola se serializan con un candado por almacenamiento. Repetir
`operationId` conserva el primer registro. `markInFlight` incrementa `attempts`;
`markFailed` conserva la operación. Los estados son `pending`, `in_flight` y
`failed`.

El outbox guarda nuevas incidencias con payload
`{ action: 'create_incident', draft }`, `incidentId = local-<operationId>` y
`baseVersion = 0` por defecto. El inicio de atención usa
`{ action: 'start', note?, evidenceIds? }`, el `incidentId` real, el `author` del
técnico y la `baseVersion` visible al encolar. El contenido se serializa mediante
el mismo puerto, así que nota y referencia de fotografía sobreviven al reinicio.

## Versión y migración

`getCurrentSchemaVersion` devuelve la versión almacenada o `0`. El salto `0 → 1`
crea los arreglos de incidencias y cola si faltan, conservando sus datos. Cuando
cambie la estructura deberá incrementarse `SCHEMA_VERSION` y añadirse el paso.

1. Leer la versión, incidencias y cola.
2. Guardar el respaldo del estado anterior.
3. Preparar las estructuras y escribir la versión nueva al terminar.
4. Si ocurre una excepción, restaurar el respaldo y devolver el resultado.

La prueba inyecta una excepción, comprueba versión `0` y conservación de los datos,
y vuelve a migrar para obtener versión `1`. Las escrituras no forman una
transacción nativa; no hay recuperación automática de una interrupción del
proceso durante ellas.

## Integración y límites

`App.tsx` inicializa la persistencia, recupera las operaciones pendientes y las
muestra mientras la sesión está cerrada. Ante un error de red al crear una
incidencia, la guarda en el outbox. El botón «Iniciar atención» también guarda
primero en la cola. Al iniciar sesión o pulsar «Sincronizar pendientes», se
reintenta con la misma identidad y se retira sólo lo confirmado.

`submitTechnicianStart` integra la comparación con la reasignación remota: no
envía el inicio si la incidencia pertenece a otro técnico, conserva la operación
como `failed`, la reporta en `conflicts` y no sobrescribe la asignación. La
evidencia de cerrar y abrir la app real, con la misma operación, nota y
referencia de fotografía, está en `evidence/week-08/native/native-restart.md`.

Los resultados actuales están en `reports/week-08/migration-tests.json`. Los logs
históricos conservan el diagnóstico anterior y las nuevas ejecuciones registran
qué fallos se corrigieron.
