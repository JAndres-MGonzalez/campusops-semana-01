# Auditoría de seguridad — Semana 4

Nombre: Juan Andrés Medina González

Grupo: 10 A

Repositorio: https://github.com/JAndres-MGonzalez/campusops-semana-01

Rama: `week4/security-audit-juan-andres-medina-gonzalez`

## Hallazgos

| # | Hallazgo | Riesgo | Solución aplicada | Evidencia |
|---|---|---|---|---|
| 1 | `.gitignore` no protegía `.env.local`, `.env.production` y otras variantes. | Una configuración privada podía agregarse al repositorio por accidente. | Se agregó `.env.*` y se permitió conservar `.env.example`. | [Antes](evidence/privacidad-antes.txt), [después](evidence/seguridad-despues.txt) y [revisión de Git](evidence/revision-git.txt). |
| 2 | El repositorio de incidencias copiaba y devolvía campos adicionales recibidos en una entrada. | Un correo o una nota privada podían conservarse y salir junto con el detalle de la incidencia. | Se guardan únicamente los nueve campos definidos por `IncidentDetail`. | [Antes](evidence/privacidad-antes.txt) y [después](evidence/seguridad-despues.txt). |
| 3 | El backend no controlaba los errores al interpretar la URL de una petición. | Una petición malformada podía terminar el proceso y dejar el servicio sin responder. | Se usa una base fija para interpretar la ruta y se responde con un error 400 si la URL es inválida. | [Antes](evidence/backend-antes.txt) y [después](evidence/seguridad-despues.txt). |

## Hallazgo 1 — Archivos de configuración sin protección

### Problema encontrado

El archivo `.gitignore` incluía `.env`, pero no sus variantes. La comprobación con `git check-ignore` mostró que `.env.local`, `.env.production`, `.env.test` y `config/.env.local` no estaban ignorados.

### Riesgo

Si uno de esos archivos guardara una contraseña o un token, podría subirse por accidente. No se encontró un archivo privado de entorno ya versionado; el problema era la falta de protección para esas variantes.

### Solución

Se ignoran `.env` y `.env.*`. La excepción `!.env.example` permite subir la plantilla de configuración. La plantilla existente solo contiene la dirección pública del backend local y no contiene credenciales.

### Antes

```gitignore
.env
```

### Después

```gitignore
.env
.env.*
!.env.example
```

### Evidencia

En `tests/security-audit.test.ts`, cuatro casos de variantes de `.env` fallaron antes del cambio y pasaron después. También se comprobó que `.env.example` puede versionarse y que no hay archivos privados de entorno en el índice de Git.

## Hallazgo 2 — Datos adicionales en las incidencias

### Problema encontrado

El constructor de `src/infrastructure/incidents/in-memory-incident-repository.ts` copiaba todo el objeto recibido con `{ ...item }`. Después, `findById` devolvía esa copia. El tipo de TypeScript no elimina propiedades adicionales durante la ejecución.

Para demostrarlo, la prueba agregó `contactEmail` y `privateNote` a una incidencia ficticia. El correo `persona@example.invalid` apareció en el resultado antes de la corrección. Estos campos son datos preparados para la prueba, no información de personas reales.

### Riesgo

Si un proveedor agrega información privada al objeto, esa información se conservaría en memoria y se devolvería aunque la aplicación no la necesite.

### Solución

El constructor copia únicamente los campos del contrato. Así se conserva la información necesaria para mostrar la incidencia y se descartan las propiedades adicionales.

### Antes

```ts
this.items = items.map((item) => ({ ...item }));
```

### Después

```ts
this.items = items.map((item) => ({
  id: item.id,
  title: item.title,
  category: item.category,
  status: item.status,
  locationLabel: item.locationLabel,
  description: item.description,
  reportedBy: item.reportedBy,
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
}));
```

### Evidencia

La prueba falló antes porque el detalle contenía `contactEmail`. Después pasó: el detalle no contiene `contactEmail` ni `privateNote`, conserva los campos necesarios y devuelve `null` cuando la incidencia no existe. Las cuatro pruebas existentes de lista, detalle y cambio de adaptador también pasaron.

## Hallazgo 3 — Peticiones que detenían el backend

### Problema encontrado

En `course-backend/server.mjs`, la URL se construía usando el encabezado `Host` sin controlar un posible error. Una petición con `Host: [` y otra con la URL `http://[` provocaron `TypeError: Invalid URL`, cerraron la conexión y terminaron el proceso.

### Riesgo

Una persona con acceso al backend podía enviar una petición inválida e interrumpir el servicio. Este hallazgo se comprobó en el simulador local del proyecto.

### Solución

Se usa `http://localhost` como base fija para interpretar la ruta, sin depender del encabezado recibido. Si la URL no se puede interpretar, el servidor devuelve `400` con el mensaje `invalid_request` y continúa funcionando.

### Antes

```js
const url = new URL(request.url ?? '/', `http://${request.headers.host ?? `${host}:${port}`}`);
```

### Después

```js
let url;
try {
  url = new URL(request.url ?? '/', 'http://localhost');
} catch {
  return send(response, 400, { code: 'invalid_request' });
}
```

### Evidencia

Las dos pruebas de `tests/security-backend.test.mjs` fallaron antes por la interrupción del servicio. Después pasaron: el encabezado malformado no detiene `/health`, la URL inválida recibe un `400` y una nueva consulta a `/health` responde `200`. La ruta protegida `/v1/resources` sigue respondiendo `401` cuando no recibe autorización.

## Comprobación final

Para instalar las dependencias y ejecutar las pruebas de esta auditoría desde la raíz del proyecto:

```bash
npm ci
npm run test:security
```

| Comando | Resultado | Evidencia |
|---|---|---|
| `npm run test:security` | 8 pruebas de privacidad y Git, y 2 pruebas HTTP aprobadas. | [Resultado corregido](evidence/seguridad-despues.txt) |
| `npm run typecheck` | Sin errores de tipos. | [Verificación del proyecto](evidence/verificacion-proyecto.txt) |
| `npm run lint` | Sin errores de estilo. | [Verificación del proyecto](evidence/verificacion-proyecto.txt) |
| `npm test -- --ci --runInBand course-tests/smoke.test.tsx evidence/week-02/list-detail.test.tsx` | 5 pruebas existentes aprobadas. | [Verificación del proyecto](evidence/verificacion-proyecto.txt) |
| `npm run backend:self-test` | Contratos del backend aprobados. | [Verificación del proyecto](evidence/verificacion-proyecto.txt) |
| `npm run check:architecture` | 13 dependencias respetan los límites de arquitectura. | [Verificación del proyecto](evidence/verificacion-proyecto.txt) |
| `npm run bundle:release` | Paquete JavaScript de Android generado por Expo. | [Generación del paquete](evidence/paquete-android.txt) |
| `git status`, `git check-ignore` y `git ls-files` | Configuración privada ignorada y sin archivos privados de entorno versionados. | [Revisión de Git](evidence/revision-git.txt) |

Los resultados anteriores a la corrección corresponden al commit `7601804feb5a488c3c34ab6ea825e6f120162b47`. Los resultados corregidos corresponden al commit `2385b30c1332767bd89e0c5177c69940a889965b`. Se conservaron las mismas pruebas para comparar ambos resultados.

Las comprobaciones usan datos ficticios y cubren los tres hallazgos descritos. El backend continúa siendo un simulador académico con identidades de prueba; esta auditoría no lo convierte en un servicio de autenticación para producción.
