# Especificación de environment-and-mongodb

## Propósito

Entorno seguro y MongoDB reproducible para fase 0.

## Requisitos

### Requisito: Entorno validado y persistencia MongoDB controlada

Las variables **MUST** validarse con Zod en server-only; los secretos **MUST NOT** llegar al cliente. Mongo local **MUST** ser predeterminado; Atlas **MUST** exigir opt-in y credenciales válidas. Un cliente compartido **MUST** soportar health, reconexión y persistencia. Los índices **MUST** crearse o validarse mediante una ejecución explícita e idempotente de `pnpm db:init`, fuera de requests y de la reconexión, sin operaciones destructivas.

#### Escenario: Configuración inválida o secreto expuesto

- GIVEN falta una variable requerida o un módulo cliente importa secretos
- WHEN se carga la configuración
- THEN falla de forma controlada y ningún secreto aparece en cliente, respuesta o bundle

#### Escenario: Mongo local e índices repetibles

- GIVEN configuración local y una base con índices existentes
- WHEN se ejecuta `pnpm db:init` dos veces fuera de requests y reconexión, y después se prueban health, persistencia y reconexión
- THEN crea o valida los índices requeridos sin duplicarlos ni eliminarlos, los otros flujos no ejecutan `db:init` y se conserva la operación de prueba

#### Escenario: Atlas no autorizado

- GIVEN Atlas no está seleccionado o su URI es inválida
- WHEN se solicita ese backend
- THEN no se conecta silenciosamente y devuelve un error controlado antes de operar
