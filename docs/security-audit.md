# Auditoria de seguridad — Semana 4

## Hallazgos

| # | Hallazgo | Riesgo | Solucion aplicada | Evidencia |
|---|---|---|---|---|
| 1 | Dependencias con vulnerabilidades de severidad alta (`@xmldom/xmldom`, `js-yaml`), detectadas con `npm audit` | Estas librerias podrian permitir inyeccion de XML o consumo excesivo de CPU si se procesan entradas maliciosas | Se ejecuto `npm audit fix` para actualizar a versiones sin la vulnerabilidad conocida | evidence/hallazgo1-antes-npm-audit.txt, evidence/hallazgo1-despues-npm-audit.txt |
| 2 | Token de API escrito directamente en codigo (ejemplo demostrativo, `src/security-audit/week4-example.ts`) | Cualquier persona con acceso al repositorio podria obtener y usar el token | Se movio a variable de entorno `process.env.EXPO_PUBLIC_API_TOKEN` con `.env.example` | evidence/hallazgo2y3-antes.txt, evidence/hallazgo2y3-despues.txt |
| 3 | `console.log` imprimiendo el objeto de usuario completo, incluyendo password (mismo ejemplo demostrativo) | Los logs podrian exponer datos sensibles del usuario | Se reemplazo por un log minimo con solo `userId` y `status` | evidence/hallazgo2y3-antes.txt, evidence/hallazgo2y3-despues.txt |

## Hallazgo 1 — Dependencias con vulnerabilidades conocidas

### Problema encontrado
`npm audit` detecto 2 vulnerabilidades de severidad alta en dependencias del proyecto: `@xmldom/xmldom` (inyeccion de fragmentos XML, entre otras) y `js-yaml` (consumo excesivo de CPU por fusion de claves vacias).

### Riesgo
Estas librerias son usadas indirectamente por el proyecto; una entrada maliciosa podria explotar estas fallas para causar comportamiento inesperado o denegacion de servicio.

### Solucion
Se ejecuto `npm audit fix`, que actualizo las dependencias afectadas a versiones parcheadas.

### Antes
Ver `docs/evidence/hallazgo1-antes-npm-audit.txt` (2 vulnerabilidades de severidad alta).

### Despues
Ver `docs/evidence/hallazgo1-despues-npm-audit.txt` (0 vulnerabilidades).

## Hallazgo 2 — Token escrito directamente en el codigo

### Problema encontrado
Se identifico que, de no tener cuidado, un token de API podria quedar escrito como texto plano en el codigo (se implemento un ejemplo demostrativo en `src/security-audit/week4-example.ts`, ya que no se encontro este patron en el codigo existente del proyecto).

### Riesgo
Cualquier persona con acceso al repositorio podria obtener y usar el token sin autorizacion.

### Solucion
Se configuro mediante `process.env.EXPO_PUBLIC_API_TOKEN` y se agrego `.env.example`.

### Antes
```ts
const API_TOKEN = "demo-token-123ABC";
```

### Despues
```ts
const API_TOKEN = process.env.EXPO_PUBLIC_API_TOKEN;
```

### Evidencia
Ver `docs/evidence/hallazgo2y3-antes.txt` y `docs/evidence/hallazgo2y3-despues.txt`.

## Hallazgo 3 — Informacion sensible enviada a consola

### Problema encontrado
En el mismo ejemplo demostrativo, se imprimia el objeto `user` completo, incluyendo el password.

### Riesgo
Si estos logs quedan almacenados o accesibles, se filtrarian datos sensibles del usuario.

### Solucion
Se reemplazo por un log que solo incluye `userId` y `status`.

### Antes
```ts
console.log(user);
```

### Despues
```ts
console.log({ userId: user.id, status: "authenticated" });
```

### Evidencia
Ver `docs/evidence/hallazgo2y3-antes.txt` y `docs/evidence/hallazgo2y3-despues.txt`.
