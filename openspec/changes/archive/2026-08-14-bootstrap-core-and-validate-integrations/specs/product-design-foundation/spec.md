# Especificación de product-design-foundation

## Propósito

Fijar verdad de producto y reglas visuales seed antes de UI.

## Requisitos

### Requisito: Gates documentales, marca y límite pre-UI

`PRODUCT.md` y `DESIGN.md` **MUST** existir antes de UI. `PRODUCT.md` **MUST** registrar propósito, usuarios, restricciones, evidencia y accesibilidad; `DESIGN.md`, modo Operate, español neutral y dirección tipográfica, sin inventar tokens ni componentes. Fuentes y activos de marca **MUST NOT** incorporarse sin archivos y licencia verificados. Este change **MUST NOT** implementar UI ni fases posteriores.

#### Escenario: Gate documental correcto

- GIVEN se propone una superficie UI
- WHEN se revisan ambos documentos y sus secciones obligatorias
- THEN se permite continuar solo si existen y están completos

#### Escenario: Activo o trabajo fuera de alcance

- GIVEN un activo sin licencia/archivo comprobado o una tarea de UI, ruta, PokéAPI, colección, chat, expedición o fase posterior
- WHEN se prepara el seed o se clasifica la tarea
- THEN el activo queda pendiente y la tarea se difiere sin agregar implementación
