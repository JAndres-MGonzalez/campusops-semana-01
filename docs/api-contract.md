# CampusOps — Contrato de datos del cliente cloud (Semana 5)

> Contrato de solicitudes, respuestas, validación y representación de errores del cliente que consulta y crea incidencias en el backend didáctico. Complementa `docs/CAMPUSOPS_API.md` y corresponde a la implementación de `parseRemoteResource` en `src/course-evaluation/index.ts`.
>
> El cliente valida los datos remotos **antes** de usarlos; ninguna pantalla hace llamadas HTTP directamente ni consume un DTO sin validar.

## 1. Servidor y autenticación

- El backend didáctico corre en `http://127.0.0.1:4310` (emulador Android: `http://10.0.2.2:4310`). No exponer a Internet.
- Actores públicos de prueba: `reporter-1`, `reporter-2`, `technician-1`, `technician-2`, `coordinator-1` (fixtures, no matrículas).
- Encabezados obligatorios en las rutas CampusOps:
  - `Authorization: Bearer course-valid-token`
  - `X-Course-Actor: <actorId>`
- Sesión sintética: `POST /v1/session/login` con `{ "actorId": "technician-1" }`.

## 2. Solicitudes (lista, detalle, creación)

| Operación | Solicitud | Reglas |
|---|---|---|
| Listar incidencias | `GET /v1/incidents` | Respuesta `{ items: [...] }`. Reportante ve sus reportes; técnico sus asignaciones; coordinador todas. |
| Detalle | `GET /v1/incidents/:id` | Devuelve el DTO de una incidencia visible para el actor. |
| Crear | `POST /v1/incidents` | Requiere `Idempotency-Key` estable. Categoría válida, descripción no vacía y `location` textual. |
| Acciones | `POST /v1/incidents/:id/actions` | `{ action, baseVersion, ... }` con `Idempotency-Key`; `409` ante versión obsoleta o clave reutilizada, `403` ante rol incompatible. |
| Salud | `GET /health` | Contrato original v1 conservado. |

Los actores válidos para creación son `reporter-1`/`reporter-2`. La incidencia inicial `campus-inc-001` pertenece a `reporter-1`, está asignada a `technician-1` y tiene `version: 1`.

## 3. Respuestas: sobre DTO

Toda incidencia viaja como un sobre DTO plano:

```json
{
  "id": "campus-inc-001",
  "version": 2,
  "status": "assigned",
  "payload": { "category": "connectivity", "description": "Falla ficticia" }
}
```

- `id` — string no vacío.
- `version` — entero no negativo (marca de concurrencia para acciones y `409`).
- `status` — string no vacío (transiciones definidas en `docs/CAMPUSOPS.md`).
- `payload` — objeto de datos de la incidencia o `null`. Un `payload: null` es una respuesta **válida**: significa "sin datos", no "formato inválido".

## 4. Validación (`parseRemoteResource`)

`parseRemoteResource(input: unknown): ParseResult` centraliza la validación del sobre. Devuelve:

- `{ ok: true, value: { id, version, status, payload } }` si el sobre cumple el contrato.
- `{ ok: false, error: 'contract' }` en cualquier otro caso.

### Reglas

| Condición | Resultado |
|---|---|
| `input` es `null`, primitivo o array | `ok: false, error: 'contract'` |
| `id` no es string o está vacío (ignora espacios) | `ok: false, error: 'contract'` |
| `status` no es string o está vacío | `ok: false, error: 'contract'` |
| `version` no es entero o es negativo | `ok: false, error: 'contract'` |
| `payload` no es objeto plano ni `null` | `ok: false, error: 'contract'` |
| Sobre válido (incluye `payload: null`) | `ok: true, value: { id, version, status, payload }` |

- **Campos futuros:** el sobre puede incluir claves adicionales (`ignored: 'forward-compatible'`); se **ignoran** y no rompen la validación.
- **Función pura:** no muta la entrada, no registra logs, no lanza excepciones.
- **Separación DTO → dominio:** el valor validado se mapea al modelo de la aplicación; la UI nunca consume el DTO crudo. Con `payload: null`, el cliente **no inventa datos**, y así queda representado en el dominio.

## 5. Representación de errores

Errores distinguibles, representados como datos (nunca excepciones sin controlar que rompan la UI):

| Situación | Cómo se representa |
|---|---|
| Datos malformados (no cumple el contrato) | `{ ok: false, error: 'contract' }` |
| `payload: null` válido | `ok: true` con `payload: null` en el dominio |
| Error del servidor (`server_error`, HTTP 500) | Estado/error del cliente de tipo `server`, sin reutilizar datos parciales |
| Límite de peticiones (`rate_limited`, 429 + `Retry-After`) | Estado/error transitorio `rate_limit`, sin reintento infinito |
| `slow` / timeout | Timeout del cliente capturado y presentado como estado de error |
| Respuesta perdida (`timeout_after_commit`) | Estado de desenlace incierto; repetición con la misma `Idempotency-Key` no duplica historial |

Las variantes deterministas se prueban con `X-Course-Scenario`: `success`, `nullable`, `server_error`, `rate_limited`, `malformed`, `slow`, `invalid_coordinates`, `incomplete`, `timeout_after_commit`.

## 6. Verificación

- Prueba pública: `npm run test -- --ci --runInBand course-tests/public/week-05.test.ts` (5 casos del sobre DTO).
- Ejecutable del toolchain: `make verify-week-05`, `make public-test-week-05`, `make evidence-week-05` (requiere la etiqueta `week-05-final`).
- Backend: `npm run backend` y `npm run backend:self-test`.
- Evidencia: `reports/week-05/contract-tests.json`, `reports/week-05/failure-matrix.json`, `evidence/week-05/engineering.json`, `evidence/week-05/individual.json`.