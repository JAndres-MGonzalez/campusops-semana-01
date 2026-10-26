# Modelo de datos local — Semana 8

## Entidades y relaciones

| Entidad | Almacenamiento y contenido |
|---|---|
| Incidencia | `campusops.data.incidents`: documentos JSON. Cada operación referencia una incidencia mediante `incidentId`. |
| Actor | `author` identifica al actor sintético que creó la operación. La cola no guarda una tabla de usuarios ni sus credenciales. |
| Operación pendiente | `campusops.queue.pending`: `operationId`, `incidentId`, `author`, `payload`, `baseVersion`, `createdAt`, `status`, `attempts` e `idempotencyKey` opcional. |
| Versión de esquema | `campusops.schema.version`: entero del esquema de incidencias y cola. |
| Respaldo de migración | `campusops.migration.snapshot`: versión, incidencias, cola y fecha anteriores a la migración. |

Una incidencia puede tener varias operaciones. Cada operación conserva su autor y
la versión de la incidencia usada como base. Una referencia de fotografía dentro
del contenido identifica un adjunto pendiente; no demuestra que exista un archivo
persistido ni que se haya enviado.

## Almacenamiento

`src/infrastructure/persistence/storage.ts` define `PersistenceStorage` e intenta
cargar `@react-native-async-storage/async-storage`. Si no encuentra ese módulo,
utiliza `MemoryStorage`, un `Map` dentro del proceso.

En esta versión, AsyncStorage no figura en `package.json` ni en el archivo de
versiones fijadas. La alternativa disponible es memoria y no conserva datos al
cerrar el proceso. Además, `App.tsx` no conecta el almacenamiento, las migraciones
ni la cola con los casos de uso. La exportación de Expo termina correctamente,
pero eso no acredita persistencia en el dispositivo.

El puerto permite agregar almacenamiento duradero sin cambiar el formato de la
cola. Para cumplir el reinicio real debe instalarse e integrarse ese adaptador y
comprobar la reapertura de la app con los mismos datos.

## Versión de esquema

`SCHEMA_VERSION` vale `1` en `src/infrastructure/persistence/schema.ts`.
`getCurrentSchemaVersion()` devuelve la versión guardada o `0` si no existe.
Al cambiar la estructura debe incrementarse la versión y añadirse su migración.

La migración actual de `0` a `1` crea los arreglos de incidencias y cola si no
existen y conserva los datos que ya estaban presentes.

## Cola de operaciones

La cola serializa sus elementos como JSON mediante el puerto de almacenamiento.
`operationId` identifica la intención; `incidentId`, `author`, `payload` y
`baseVersion` permiten saber sobre qué incidencia, actor, cambio y versión opera.
`createdAt` registra su creación. Los estados son `pending`, `in_flight` y `failed`;
`markInFlight` incrementa `attempts`.

`enqueue` actualmente reemplaza el registro anterior con la misma identidad.
Dos llamadas simultáneas pueden leer la misma cola y sobrescribir una operación.
Ambos casos fallan en `evidence/week-08/review.test.ts`. El registro inicial debe
conservarse y las escrituras necesitan coordinación para no perder cambios.

## Migración y recuperación

1. Leer la versión y los datos existentes.
2. Guardar un respaldo de versión, incidencias y cola.
3. Preparar los arreglos necesarios y escribir la nueva versión al terminar.
4. Si ocurre una excepción, intentar restaurar el respaldo y devolver el resultado.

`migrate({ injectFailure: true })` devuelve `success: false` y `rolledBack: true`
en la prueba controlada; se conserva una incidencia y una operación con versión
`0`. Un segundo intento sin falla completa la versión `1`.

Las escrituras se hacen por separado. No hay una transacción del almacenamiento
ni recuperación automática del respaldo al abrir la app después de una
interrupción del proceso. La prueba actual comprueba una excepción capturada en
memoria, no una interrupción de una migración en un dispositivo.

## Comprobación

Los casos y resultados están en `reports/week-08/migration-tests.json` y en
`evidence/week-08/logs/integration-tests.log`. La prueba de Kevin reconstruye la
cola sobre el mismo objeto de memoria: conserva su contenido durante ese
proceso, pero no comprueba cerrar y volver a abrir la aplicación.
