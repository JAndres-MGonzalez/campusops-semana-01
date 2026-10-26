# Modelo de datos local — Semana 8 (Parte A)

Alcance de este documento: el núcleo de persistencia implementado en
`src/infrastructure/persistence/**`. No describe trabajo de otras partes del
equipo; si un elemento no aparece aquí, no forma parte de esta entrega.

## Entidades

| Entidad | Dónde vive | Campos |
|---|---|---|
| Incidencia | `STORAGE_KEYS.INCIDENTS` (`campusops.data.incidents`) | `id`, estado y campos de trabajo serializados como JSON. El núcleo no impone el modelo de dominio: guarda el documento tal como lo entrega la capa de aplicación. |
| Operación pendiente | `STORAGE_KEYS.PENDING_QUEUE` (`campusops.queue.pending`) | `operationId`, `incidentId`, `author`, `payload`, `baseVersion`, `createdAt`, `status`, `attempts`, `idempotencyKey?` |
| Versión de esquema | `STORAGE_KEYS.SCHEMA_VERSION` (`campusops.schema.version`) | Entero. `SCHEMA_VERSION = 1`. |
| Snapshot de migración | `STORAGE_KEYS.MIGRATION_SNAPSHOT` (`campusops.migration.snapshot`) | `schemaVersion`, `incidents`, `queue`, `timestamp` |

## Relaciones

- Una **incidencia** (`incidentId`) agrupa cero o más **operaciones pendientes**.
- Cada **operación pendiente** referencia a un **autor** (`author`) y declara la
  `baseVersion` de la incidencia sobre la que se construyó.
- La **versión de esquema** aplica al conjunto `incidencias + cola`; un snapshot
  captura ambos para poder restaurarlos juntos.

## Almacenamiento elegido

`src/infrastructure/persistence/storage.ts` define el puerto
`PersistenceStorage` (`getItem`, `setItem`, `removeItem`, `clear`) y resuelve la
implementación concreta en este orden:

1. `@react-native-async-storage/async-storage` si está disponible en el entorno
   (dispositivo / Expo). Es la vía real de persistencia entre reinicios.
2. `MemoryStorage` como respaldo determinista (pruebas y entornos sin el módulo).

El punto deliberado es que la cola nunca vive en el árbol de componentes ni en un
array de módulo: siempre se lee y escribe a través del puerto, de modo que
cambiar el medio no obliga a tocar la lógica de cola o de migración.

## Versión de esquema

- `SCHEMA_VERSION = 1` en `schema.ts`. Es la única fuente de verdad.
- `getCurrentSchemaVersion()` devuelve `Number(valor guardado)` o `0` si no hay
  versión registrada (instalación nueva o datos de esquema anterior).
- La versión se incrementa cuando cambia la forma de lo persistido y se agrega un
  paso en `applyMigration`. Un cambio de forma sin incremento de versión queda
  prohibido por revisión.

## Estructura de la cola

`PendingOperation` es inmutable (`readonly`) y exige:

| Campo | Por qué |
|---|---|
| `operationId` | Identidad estable de la operación. Es la clave de idempotencia y de deduplicación. |
| `incidentId` | Liga la operación con la incidencia afectada. |
| `author` | Actor que originó el cambio; sostiene la autorización por perfil. |
| `payload` | Contenido del cambio (notas, referencias a fotos pendientes, etc.). |
| `baseVersion` | Versión sobre la que se construyó; base para detectar conflicto. |
| `createdAt` | Orden temporal de encolado. |
| `status` | `pending`, `in_flight` o `failed`. |
| `attempts` | Conteo de reintentos; se incrementa en `markInFlight`. |

**Por qué es persistente:** `enqueue` serializa la cola completa a
`campusops.queue.pending`. Al reconstruir la cola (`createPersistentQueue`)
sobre el mismo almacenamiento se recuperan los mismos `operationId`, incidentes y
payloads. Una lista en memoria no cumple el requisito del hito.

`enqueue` es idempotente por construcción: descarta cualquier elemento previo con
el mismo `operationId` antes de insertar, así que reencolar no duplica.

## Procedimiento de migración y recuperación

`migrations.ts` implementa una migración con snapshot previo:

1. **Leer versión actual** (`getCurrentSchemaVersion`). Si ya es
   `SCHEMA_VERSION`, no hay trabajo que hacer.
2. **Crear snapshot** de incidencias, cola y versión (`createSnapshot`) y
   guardarlo en `campusops.migration.snapshot`.
3. **Aplicar pasos** (`applyMigration`). El paso `0 → 1` garantiza que existan las
   estructuras de incidencias y cola.
4. **Commit**: si todos los pasos terminan, se escribe la nueva versión.
5. **Rollback**: ante cualquier excepción, `restoreFromSnapshot` reescribe
   incidencias, cola y versión al estado exacto anterior. El resultado reporta
   `rolledBack: true`.

Consecuencia verificable: una falla a mitad de migración no deja el esquema
mezclado. Las incidencias y la cola previas siguen presentes y la versión sigue
siendo la anterior; un segundo intento sin falla completa la migración.

## Verificación

`src/infrastructure/persistence/week-08-evidence.test.ts` ejecuta los cinco casos
del hito contra este código. Los comandos y resultados observados están indexados
en `reports/week-08/migration-tests.json`.
