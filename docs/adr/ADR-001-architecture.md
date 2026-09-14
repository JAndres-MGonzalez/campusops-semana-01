# ADR-001 — Arquitectura de capas con puertos y adaptadores para CampusOps

## Estado: Aceptado

## Contexto
CampusOps tendrá pantallas, reglas de incidencias, sesión, almacenamiento y servicios
de ubicación. Necesitamos separar responsabilidades para probar cada parte y cambiar un
proveedor sin rehacer el proyecto. El stack está fijado: React Native + Expo + TypeScript
(no se vuelve a elegir).

## Alternativa A — Capas hexagonales (puertos y adaptadores)
Capas: UI (pantallas) → Application (casos de uso) → Domain (modelos y contratos) ←
Infrastructure (adaptadores). La UI no conoce a la infraestructura; la app se arma en
App.tsx como composition root. El dominio no importa tecnología.

## Alternativa B — Slices verticales por feature
Cada módulo (incidencias, sesión, ubicación) agrupa su pantalla, servicio y proveedor.
Menos carpetas al inicio, pero acopla la presentación con la infraestructura al sumar
proveedores, y exige dobles de prueba por módulo.

## Decisión
Elegimos la Alternativa A: testabilidad (los casos de uso se prueban con fakes que
implementan el puerto), complejidad acotada al tamaño actual de la app y cambio de
proveedor = nuevo adaptador sin tocar UI ni casos de uso.

## Consecuencias
- + La disciplina de imports se enforcea con tools/check-boundaries.mjs.
- + Sustituir almacenamiento o ubicación solo exige otro adaptador del mismo puerto.
- + Las pantallas son componentes de presentación puros, fáciles de testear.
- - Estructura inicial mayor que la Alternativa B.
- - El wiring central en App.tsx concentra responsabilidades de composición.

## Trade-off
Ganamos testabilidad y aislamiento de proveedores a costa de más archivos y disciplina de
imports; para una app del tamaño de CampusOps el costo es aceptable y evita rehacer el
proyecto al llegar a sesión, persistencia y mapas.
