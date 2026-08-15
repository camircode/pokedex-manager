# Especificación de integration-contracts

## Propósito

Validar Better Auth, Kimi y MCP sin convertirlos aún en producto.

## Requisitos

### Requisito: Contratos externos verificables y sin escritura del modelo

Better Auth **MUST** usar el adaptador Mongo y OAuth Provider vigentes, demostrar sesión persistente y **MUST NOT** usar el plugin MCP legado. Kimi **MUST** usar `kimi-k2.6`, fixture de imagen, JSON Schema simple, `finish_reason`, parseo y Zod; CI **MUST** usar mock y live será opt-in. MCP **MUST** ser Streamable HTTP autenticado e interoperable. El modelo **MUST NOT** escribir directamente en MongoDB.

#### Escenario: Auth y Kimi válidos

- GIVEN Mongo local, OAuth declarado y mock Kimi completo
- WHEN se crea/recupera una sesión y se procesa la respuesta
- THEN persiste la sesión, OAuth Provider–MCP pasa o falla explícitamente, y Kimi supera `finish_reason`, JSON y Zod

#### Escenario: Resultado Kimi inválido

- GIVEN una respuesta truncada, no parseable o incompatible con Zod
- WHEN se procesa
- THEN falla sin aceptar la salida ni permitir escritura del modelo

#### Escenario: Ciclo MCP y solicitudes inválidas

- GIVEN cliente compatible, credenciales válidas y `Origin` permitido
- WHEN inicializa por POST, usa una tool de solo lectura, consulta por GET y cierra por DELETE con `Accept`, versión y `mcp-session-id`
- THEN conserva la sesión; Origin no permitido, auth ausente, método inválido o request mal formado reciben 4xx verificable
