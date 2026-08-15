# Especificación de product-design-foundation

## Propósito

Mantener la verdad de producto y las reglas visuales durables de la interfaz.

## Requisitos

### Requisito: Contratos documentales, marca y accesibilidad

`PRODUCT.md` y `DESIGN.md` **MUST** mantenerse como fuentes de verdad. `PRODUCT.md` **MUST** registrar propósito, usuarios, restricciones, evidencia y accesibilidad; `DESIGN.md`, modo de operación, español neutral y dirección tipográfica. Fuentes y activos de marca **MUST NOT** incorporarse sin archivos y licencia verificados.

#### Escenario: Contrato documental correcto

- GIVEN se propone o modifica una superficie de interfaz
- WHEN se revisan ambos documentos y sus secciones obligatorias
- THEN se permite continuar solo si existen y están completos

#### Escenario: Activo sin licencia verificada

- GIVEN un activo sin licencia o archivo comprobado
- WHEN se diseña o implementa una superficie
- THEN el activo queda pendiente y se usa una alternativa con licencia verificada
