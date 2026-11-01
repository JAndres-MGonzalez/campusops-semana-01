# Política de resiliencia — Semana 9

CampusOps conserva la captura manual cuando el proveedor de ubicación falla.
Las operaciones con efecto sólo se repiten con la misma identidad y contenido,
con un máximo de cuatro solicitudes y tres esperas.

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
- La alternativa manual no sustituye la sesión. El token didáctico dura 60 s:
  si vence sin conexión y la renovación falla, la app puede rechazar el guardado.
  Se conserva el formulario para reautenticarse y repetir, sin declarar una
  operación confirmada ni encolada cuando no lo está.

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
- **Respuesta perdida:** se reprodujo al **resolver** (técnico) y al **cerrar** (coordinador).
  Con la incidencia `campus-inc-001` ya en `in_progress`, `POST /v1/incidents/campus-inc-001/actions`
  con `timeout_after_commit` y abort a los 800 ms: el servidor ya había guardado (`resolved`, versión 3;
  `closed`, versión 4). La repetición con la **misma clave y el mismo cuerpo** (`resolve-campus-inc-001-op-9`
  y `close-campus-inc-001-op-10`) devolvió `200` con `duplicate: true` y quedó un solo evento de historial
  por clave.

## 8. Decisión y métricas independientes

| Situación | Acción | Motivo |
|---|---|---|
| Lectura de incidencias con timeout o estado transitorio publicado | Hasta tres reintentos; backoff 500, 1000 y 2000 ms | Recuperar sin una ráfaga ilimitada de solicitudes. |
| POST con clave estable y fallo transitorio | Repetir con igual clave y cuerpo | El servidor reconoce el efecto ya aplicado. |
| POST sin clave, 409 u otro error no transitorio | Informar el fallo y conservar el pendiente | Repetir no garantiza seguridad ni corrige el contrato. |
| Proveedor de ubicación inválido, lento, limitado o desconectado | Una solicitud y alternativa manual | La captura puede continuar sin inventar coordenadas. |

`evidence/week-09/retry-metrics.test.ts` cuenta las solicitudes del cliente real
con respuestas controladas y reloj inyectado. Comprueba 429 con dos solicitudes
y espera de 1000 ms; 503 persistente con cuatro solicitudes y esperas de
500/1000/2000 ms; Retry-After de 120 s recortado a 30000 ms; y POST sin clave
o conflicto 409 con un único intento. Sus tiempos son de reloj controlado.

`node evidence/week-09/scripts/retry-live-metrics.mjs` inicia un backend local
aislado y usa el ejecutor real. Al resolver y cerrar, aborta la primera respuesta
a los 800 ms y repite con la misma clave y cuerpo. Cada operación debe producir
dos solicitudes, `duplicate=true` y un solo evento de historial. Las esperas y
tiempos de este script se miden con reloj real. Los resultados están en
`reports/week-09/retry-metrics.json` y `evidence/week-09/logs/retry-live.log`.

## 9. Verificación de la versión

El workflow obtiene el historial completo y, en un PR, revisa su SHA de origen.
Así están disponibles los tags y se comprueba la misma versión identificada en
los reportes, en lugar del commit temporal que GitHub prepara para el PR. Todos
los comandos obligatorios y sus códigos de error se conservan.

Los resultados anteriores de cada integrante se conservan con su SHA original.
Dos ramas aportaron un log con el mismo nombre; el de Kevin se preservó como
`evidence/week-09/logs/kevin-linea-base-week-06-08.log` y el de Ismael conserva
`evidence/week-09/logs/linea-base-week-06-08.log`.

## 10. Recorrido Android

La integración se instaló como APK en Android 16/API 36. Se verificaron búsqueda
con proveedor, guardado en línea y detalle. Con una sesión recién iniciada se
interrumpió el acceso al backend local: la búsqueda conservó la ubicación manual,
el guardado quedó en la cola y, al reconectar, sólo salió tras confirmación. La
lista y el detalle mostraron la ubicación escrita. Capturas, pasos y límites en
`evidence/week-09/native/andres-ui.md`.

Las capturas anteriores de Ismael que muestran un rechazo de permiso se conservan
como diagnóstico. Este recorrido no afirma que el guardado funcione después de
perder la sesión sin conexión.
