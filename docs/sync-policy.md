# Política de sincronización — Semana 8 (Parte A)

Alcance: la lógica implementada en `src/infrastructure/persistence/**` y
`src/infrastructure/sync/**`, y su delegación desde
`src/course-evaluation/index.ts`. La autorización por perfil se hereda de la
Semana 6 y este documento no la redefine.

## Identidad estable

La identidad de una operación es `operationId`. No se deriva del contenido ni del
timestamp: se asigna al crear el cambio y se conserva al reencolar, reintentar o
reproducir el flujo. `deduplicateOperations` usa esa clave y **conserva la primera
aparición**, sin mutar las entradas.

## Combinar o declarar conflicto

`resolveSync(base, local, remote)` compara campo por campo contra `base` usando
igualdad por contenido JSON **canónica** (`canonicalJson`): las claves de los
objetos se ordenan de forma recursiva antes de serializar, por lo que reordenar
propiedades no cuenta como cambio ni produce un falso conflicto. Los arreglos
siguen siendo ordenados: su orden es contenido. Los campos se recorren en orden
alfabético, de modo que el reporte sea determinista.

| Situación | Resultado |
|---|---|
| Solo `local` cambió el campo | Se toma el valor local |
| Solo `remote` cambió el campo | Se toma el valor remoto |
| Ambos cambiaron el campo al **mismo** valor | Se toma ese valor |
| Ambos cambiaron el campo a valores **distintos** | `{ kind: 'conflict', fields: [...] }` |

Reglas adicionales:

- Los campos en conflicto se devuelven **ordenados por nombre**.
- `base`, `local` y `remote` son de solo lectura: la función no muta ninguna
  entrada.
- La agrupación de estado y técnico asignado bajo un campo `work` es una decisión
  del contrato de pruebas, no del algoritmo. `resolveSync` es genérico: funciona
  con cualquier campo y cualquier anidamiento representable en JSON.
- Un campo presente en un lado y ausente en el otro sigue siendo un cambio de
  contenido; el orden de las claves no lo es.

## Qué se conserva, qué se combina, qué requiere resolución

- **Se conserva:** todo campo sin cambios, y todo cambio que exista en una sola
  de las dos partes.
- **Se combina:** cambios en campos distintos, o el mismo cambio con el mismo
  valor en ambos lados.
- **Requiere resolución:** un mismo campo cambiado a valores distintos en local y
  remoto. La función reporta el conflicto; no impone el valor remoto ni descarta
  la intención local.

En el caso de reasignación concurrente, local (inicio de atención) y remoto
(nuevo técnico asignado) tocan el mismo campo `work` con valores distintos: se
declara conflicto y **ambos hechos quedan disponibles** para que la capa de
aplicación los muestre. El núcleo no elige por el usuario.

## Ciclo de vida en la cola

`PendingOperation.status` modela el estado de envío:

- `pending` → encolada y aún sin intento.
- `in_flight` → se marcó el intento (`markInFlight`, incrementa `attempts`).
- `failed` → el intento falló (`markFailed`), permanece en la cola.

**Cuándo se retira una operación:** únicamente por `remove(operationId)`, es
decir, cuando la capa que sincroniza tiene la confirmación. Marcar `failed` o
detectar un conflicto **no** retira la operación: solo cambia su estado. Esto
evita perder cambios por un error transitorio o por un conflicto no resuelto.

**Reintento:** el núcleo no impone una política de backoff; expone `attempts` y el
estado para que la capa de sincronización decida. Un reintento reutiliza el mismo
`operationId`, por lo que el servidor puede aplicarlo una sola vez.

## Bandeja de salida (outbox) y conexión con la app

`src/infrastructure/sync/outbox.ts` conecta la cola con las acciones reales de la
pantalla:

1. **Guardar sin conexión** (`saveOffline`). Ante un error de red o timeout, la
   intención se escribe en la cola persistente con `operationId` propio,
   `incidentId = local-<operationId>` y payload
   `{ action: 'create_incident', draft }`. La UI recibe un detalle local
   (`id = pending-<operationId>`) sin esperar al servidor.
2. **Reenviar al reconectar** (`flush`). Al iniciar sesión o pulsar
   «Sincronizar pendientes» se recorre la cola y se envía cada operación con su
   **mismo** `operationId` como `Idempotency-Key`. El backend deduplica por esa
   clave: si el intento anterior llegó a aplicarse, no produce un segundo efecto.
3. **Retirar sólo lo confirmado.** `remove(operationId)` se llama únicamente
   cuando el envío devolvió el recurso confirmado. Un error, un timeout, una
   respuesta nula o un conflicto marcan `failed` y dejan la operación en la cola.
4. **Recuperación al cerrar y abrir.** Al arrancar, `initializePersistence()`
   migra si hace falta y la app cuenta las operaciones guardadas; si hay alguna,
   lo informa y queda disponible para el siguiente `flush`. El almacenamiento es
   AsyncStorage, así que el cierre de la app no borra la cola.

`flush` es *single-flight*: si dos reconexiones lo disparan a la vez, ambas
esperan la misma ejecución y ninguna operación se envía dos veces. Antes de tocar
la red se marca `in_flight`; si la app muere a mitad del envío, el reintento usa
el mismo `operationId` y el servidor lo deduplica.

## Idempotencia

- `operationId` estable + `enqueue` que **conserva la primera** entrada por clave =
  una sola operación pendiente por intención, aunque se reencole.
- `deduplicateOperations` colapsa repeticiones conservando la primera.
- El `Idempotency-Key` enviado al backend es el mismo `operationId`; el backend
  responde con el resultado ya aplicado si la clave se repite y con `409` si la
  misma clave llega con contenido distinto.
- `payload` y `baseVersion` permiten que el receptor verifique que ya aplicó esa
  operación sin volver a producir el efecto.

## Vinculación con pruebas

- `reports/week-08/migration-tests.json` indexa los casos con comando y resultado
  observado: reinicio de cola, migración válida, migración fallida con rollback,
  conflicto de reasignación, combinación de campos independientes, deduplicación,
  guardados simultáneos con primera intención conservada, orden de claves JSON y
  outbox (retiro sólo de lo confirmado y reintento con la misma identidad).
- `src/infrastructure/persistence/week-08-evidence.test.ts` es el ejecutable que
  respalda esos casos (8/8 en verde).
- `src/infrastructure/persistence/queue.test.ts`,
  `src/infrastructure/sync/resolve.test.ts` y
  `src/infrastructure/sync/outbox.test.ts` cubren los escenarios en detalle.
- `course-tests/public/week-08.test.ts` valida el contrato público de
  `resolveSync` y `deduplicateOperations` (3/3 en verde).
