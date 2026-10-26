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

## Aporte Parte B (Ismael, 3523110741): observaciones reproducidas

Base: rama `week-08/parte-b-ismael` sobre `2b964f4`. Se ejecutó
`npm.cmd test -- --ci --runInBand --verbose src/infrastructure/persistence/week-08-evidence.test.ts`
(5 de 5 en verde) y cada caso por separado con `-t reinicio|migracion|conflicto|combinacion|idempotencia`
(1 passed, 4 skipped en cada uno). `typecheck` y `course-tests/public/week-08.test.ts` (3 de 3) también en verde.

### Observado al ejecutar

- **Reinicio:** se simula creando otra instancia de `createPersistentQueue` sobre el mismo
  `createMemoryStorage`. Recupera `op-inicio-001`, `inc-0001`, autor y payload idénticos. No se cierra
  la app real, así que la persistencia entre procesos no se verificó con esta prueba.
- **Migración fallida:** con `migrate({ injectFailure: true })` el resultado es `success=false` y
  `rolledBack=true`; la versión queda en 0 y se conservan la incidencia y la operación pendiente.
  Un segundo `migrate()` sin inyección termina con `success=true`, versión 1 y los mismos datos.
  Hoy solo existe el salto 0 a 1, que crea estructuras vacías si faltan; no transforma datos.
- **Conflicto:** `resolveSyncReal` devuelve `{ kind: 'conflict', fields: ['work'] }` y las tres entradas
  conservan su JSON original. Ambos hechos (inicio local y reasignación remota) quedan disponibles
  porque la función no escribe ninguno; decidir cuál aplicar le toca a la capa de aplicación.
- **Combinación:** campos distintos desde la misma base dan `{ title: 'Local', priority: 2 }`.
- **Idempotencia:** `deduplicateOperationsReal` pasa de 3 a 2 operaciones, conserva el payload
  `primera` y no muta el arreglo de entrada.

### Observado al leer el código (no ejecutado)

- `enqueue` reemplaza una operación con el mismo `operationId` y se queda con la **última**, mientras
  que `deduplicateOperationsReal` se queda con la **primera**. Reencolar el mismo `operationId` con
  otro payload sobrescribe el original en la cola. Conviene acordar con Kevin y Andrés cuál regla vale.

### Sin cobertura en estas pruebas

- Que solo se retire lo confirmado (`remove`), que `markFailed` o un conflicto no la retiren y el uso de
  `attempts`: la política lo describe, pero ninguna prueba lo ejecuta.
- La autorización por perfil de la Semana 6: no se ejerce en estos casos.