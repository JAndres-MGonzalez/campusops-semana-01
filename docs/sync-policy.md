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
igualdad por contenido JSON (`JSON.stringify`). Los campos se recorren en orden
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

## Idempotencia

- `operationId` estable + `enqueue` que reemplaza por clave = una sola entrada por
  operación, aunque se reencole.
- `deduplicateOperations` colapsa repeticiones conservando la primera.
- `payload` y `baseVersion` permiten que el receptor verifique que ya aplicó esa
  operación sin volver a producir el efecto.

## Vinculación con pruebas

- `reports/week-08/migration-tests.json` indexa los casos con comando y resultado
  observado: reinicio de cola, migración válida, migración fallida con rollback,
  conflicto de reasignación, combinación de campos independientes y deduplicación.
- `src/infrastructure/persistence/week-08-evidence.test.ts` es el ejecutable que
  respalda esos casos.
- `course-tests/public/week-08.test.ts` valida el contrato público de
  `resolveSync` y `deduplicateOperations` (3/3 en verde).
