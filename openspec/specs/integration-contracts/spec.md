# Especificación de integration-contracts

## Propósito

Mantener verificables las fronteras de Better Auth, Kimi y MCP usadas por el producto.

## Requisitos

### Requisito: Contratos externos verificables y sin escritura del modelo

Better Auth **MUST** usar el adaptador Mongo, demostrar sesión persistente y limitarse a correo y contraseña mientras OAuth no sea un requisito del producto. Kimi **MUST** usar `kimi-k2.6`, fixture de imagen, JSON Schema simple, `finish_reason`, parseo y Zod; CI **MUST** usar simulaciones deterministas y la ejecución real será opt-in. MCP **MUST** ser Streamable HTTP autenticado e interoperable. El modelo **MUST NOT** escribir directamente en MongoDB.

#### Escenario: Auth y Kimi válidos

- GIVEN Mongo local, Better Auth por correo y una simulación Kimi completa
- WHEN se crea/recupera una sesión y se procesa la respuesta
- THEN persiste la sesión, MCP mantiene autenticación independiente y Kimi supera `finish_reason`, JSON y Zod

#### Escenario: Resultado Kimi inválido

- GIVEN una respuesta truncada, no parseable o incompatible con Zod
- WHEN se procesa
- THEN falla sin aceptar la salida ni permitir escritura del modelo

#### Escenario: Ciclo MCP y solicitudes inválidas

- GIVEN cliente compatible, credenciales válidas y `Origin` permitido
- WHEN inicializa por POST, usa una tool de solo lectura, consulta por GET y cierra por DELETE con `Accept`, versión y `mcp-session-id`
- THEN conserva la sesión; Origin no permitido, auth ausente, método inválido o request mal formado reciben 4xx verificable
