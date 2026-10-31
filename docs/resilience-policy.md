# Política de resiliencia — Semana 9 (borrador de Parte B)

Borrador técnico de Ismael (`3523110741`) con datos verificables del código y de las
ejecuciones reales. Andrés consolida la redacción final.

## 1. Proveedor y ejecución externa

- **Contrato:** `GET /v1/geocoding?q=<texto>` con `Authorization: Bearer <token de sesión>`
  y `X-Course-Actor: <actor vigente>`. Sin `q` el backend responde `422`.
- **Proveedor usado:** el doble controlado local de `course-backend/` (`npm run backend`).
  No se usa un proveedor comercial porque tiene cuotas y límites de uso, su disponibilidad
  no se controla (no permite reproducir 429, lentitud o respuestas incompletas a demanda)
  y la actividad exige datos ficticios, no ubicaciones reales de personas o edificios.
- **Adaptador:** `src/infrastructure/geocoding/provider.ts`. Un `AbortController` y un
  temporizador por llamada (2000 ms por defecto), sin token no toca la red y devuelve el
  JSON tal cual: la validez de las coordenadas la decide `selectIncidentLocationReal`
  (`select-location.ts`, de Kevin). No registra URL, consulta ni cuerpo.
- **Escenarios reproducibles con `X-Course-Scenario`:** `incomplete`, `invalid_coordinates`,
  `rate_limited` (429 con `retry-after: 1`), `slow` (responde a los 1200 ms) y `server_error` (500).

## 2. Caché

- **Qué guarda:** sólo ubicaciones **válidas del proveedor**. Nunca fallos, 429, etiquetas
  vacías ni respuestas inválidas (lo decide `service.ts`).
- **Clave normalizada:** `trim()`, espacios internos colapsados y minúsculas
  (`' Edificio  A '` y `'edificio a'` son la misma entrada).
- **TTL:** 5 minutos. **Tamaño máximo:** 32 entradas; al llenarse se desaloja la más antigua (FIFO).
- **Copia congelada:** quien lee no comparte un objeto mutable con la caché.
- **Por qué en memoria:** la caché evita repetir consultas dentro de la sesión de captura; no es un
  dato que deba sobrevivir. Persistirla añadiría retención de ubicaciones sin necesidad.

## 3. Ubicación manual

- Se conserva la referencia escrita cuando: la consulta está vacía, el proveedor falla
  (timeout, 429, 5xx, red, sin permiso) o responde con datos incompletos o fuera de rango.
- **Nunca se inventan coordenadas** ni se completan campos faltantes con ceros. `(0, 0)` sí es
  una coordenada válida cuando el proveedor la envía.
- `location` viaja como **texto** al backend. Las coordenadas **no** se envían al crear la
  incidencia (el contrato no las acepta) ni forman parte del borrador.
- La UI conserva exactamente lo que la persona escribió; «Guardar incidencia» no depende de la
  geocodificación.

## 4. Reintentos de operaciones con efecto

Reglas implementadas en `src/infrastructure/resilience/retry-policy.ts` (`planRetryReal`) y
ejecutadas por `retry-executor.ts` (ambos de Kevin):

| Situación | Decisión |
|---|---|
| `timeout`, 408, 425, 429, 500, 502, 503, 504 | Reintentar si la operación es segura |
| Otros estados (p. ej. 400, 401, 403, 404, 409, 422) | No reintentar |
| Desde el intento 4 | No reintentar (`firstNonRetryableAttempt: 4`) |
| Espera sin `Retry-After` | Backoff exponencial 500, 1000, 2000… ms con tope de 8000 ms |
| Con `Retry-After` válido | Se respeta, acotado a 30 000 ms |
| `POST` sin clave de idempotencia estable (mín. 8 caracteres) | No se repite |
| `POST` con la misma clave y el mismo contenido | Se puede repetir sin duplicar el efecto |

## 5. Cuándo NO reintentar la geocodificación

La geocodificación es una **lectura opcional con alternativa manual**. Reintentarla
automáticamente multiplicaría las solicitudes ante 429/5xx sin proteger ningún efecto. Por eso
hace **una sola solicitud** y, si falla, cae a la referencia manual; la persona puede volver a
buscar. Las operaciones con efecto (crear, iniciar atención) sí usan los reintentos acotados de
la sección 4.

## 6. Cuándo informar fallo

- Operación con efecto **sin clave estable**: no se repite y se informa.
- `409` (conflicto de versión o clave reutilizada con otro contenido) y otros `4xx` no reintentables.
- Límite de reintentos agotado: la operación permanece `failed` en la cola, sin perderse.
- En geocodificación nunca se informa como error bloqueante: se muestra el aviso «No se pudo
  obtener la ubicación. Se conserva tu referencia manual.» y se sigue.

## 7. Evidencia

- `reports/week-09/fault-injection.json` — fallos reproducidos contra el backend controlado
  (éxito, caché, coordenadas inválidas, incompleto, 429, 500, timeout, desconexión y respuesta
  perdida tras guardar).
- `reports/week-09/retry-metrics.json` — intentos y tiempos observados (Andrés).
- `evidence/week-09/logs/` — salidas reales de las pruebas y de `fault-injection.mjs`.
- **Respuesta perdida:** `POST /v1/incidents/campus-inc-001/actions` (`start`, `baseVersion: 1`)
  con la clave `resolve-campus-inc-001-op-9` y `timeout_after_commit`, abortado a los 800 ms: el
  servidor ya había guardado (`in_progress`, versión 2). La repetición con la misma clave devolvió
  `200` con `duplicate: true` y quedó un solo evento de historial para esa clave.
