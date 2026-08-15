# Propuesta: bootstrap-core-and-validate-integrations

## Intención

Base reproducible para TanStack Start, TypeScript estricto, MongoDB e integraciones antes de UI. Generar en staging, integrar en raíz y ejecutar `git init` después; `--no-git` solo aplica al staging.

## Alcance

### Incluido
- Scaffold TanStack Start con `pnpm`, calidad, tests, build y CI.
- Integración por allowlist, conservando `openspec/`, `.atl/` y el PDF; luego `git init` en raíz.
- Zod server-only; Mongo local/Atlas opt-in, cliente/health compartidos y `pnpm db:init` idempotente fuera de requests y reconexión.
- Spikes Better Auth Mongo/OAuth Provider, Kimi `kimi-k2.6` imagen/JSON, MCP Streamable HTTP/OAuth y seeds `PRODUCT.md`/`DESIGN.md`; activos sin licencia verificada quedan fuera.

### Fuera de alcance
- UI, rutas, PokéAPI, colección, chat, expediciones, persistencia conversacional y fases posteriores.
- Escrituras directas del modelo, plugin MCP legado, Mongoose, Drizzle, OmniRoute y despliegue.

## Capacidades

### Nuevas capacidades
- `core-bootstrap`: scaffold, Git y calidad reproducibles.
- `environment-and-mongodb`: entorno, `db:init` y persistencia local/Atlas.
- `integration-contracts`: contratos verificables de Better Auth, Kimi y MCP.
- `product-design-foundation`: verdad de producto y reglas visuales seed.

### Capacidades modificadas
- Ninguna; `openspec/specs/` no contiene capacidades existentes.

## Enfoque

Ejecutar `pnpm dlx @tanstack/cli create ... --blank --package-manager pnpm --no-git --no-install --target-dir <staging> -y`; `--no-git` únicamente en staging. Integrar mediante allowlist sin `--force` y ejecutar `git init` en raíz. `auto-chain`/5000 separa work units. Usar driver, `@better-auth/mongo-adapter` y `pnpm db:init` como tarea explícita, nunca desde requests, health o reconexión. Kimi valida `finish_reason`, JSON y Zod; MCP cubre HTTP autenticado.

## Áreas afectadas

| Área | Impacto | Descripción |
|---|---|---|
| `package.json`, `pnpm-lock.yaml`, `src/`, `.github/workflows/` | Nueva | Scaffold, calidad e integraciones. |
| `scripts/db-init.ts`, `src/server/db/`, `.env.example`, `docker-compose.yml`, `tests/` | Nueva | Mongo, `db:init` y contratos. |
| `.git/`, `PRODUCT.md`, `DESIGN.md` | Nueva | Git raíz y gates documentales pre-UI. |

## Riesgos

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| Git anidado o sobrescritura | Media | Staging, allowlist, `--no-git` solo allí y nunca `--force`. |
| APIs, coste o secretos | Media | Lockfile, gates, mocks y live opt-in. |

## Reversión

Eliminar lo creado por el change y conservar preexistentes. Eliminar `.git/` solo si este change lo creó sin trabajo posterior; `db:init` no es destructivo.

## Dependencias

- Git, Node, pnpm y Docker.
- Se prohíben `npm`, `yarn` y `bun`.

## Criterios de éxito

- [ ] `--no-git` se usa solo en staging; después, la raíz satisface `git rev-parse --is-inside-work-tree` sin `.git` anidado.
- [ ] `pnpm install --frozen-lockfile`, lint, typecheck, tests y build pasan en CI.
- [ ] `pnpm db:init` corre dos veces fuera de requests y reconexión sin duplicar/eliminar índices; health/reconexión no los inicializa.
- [ ] Los contratos rechazan respuestas inválidas, MCP es interoperable y los seeds existen antes de UI.
