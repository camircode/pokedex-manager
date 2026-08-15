# Diseño: bootstrap-core-and-validate-integrations

## Enfoque técnico

Generar TanStack Start `--blank` en staging y trasladar una allowlist a la raíz, conservando `openspec/`, `.atl/` y `nuevoexamen.pdf`; `--no-git` solo allí y luego `git -C <root> init`. Sin remotos ni commits. Pre-UI: adaptadores server-only; CI usa mocks/Mongo local; Atlas, OAuth y Kimi live son opt-in.

## Decisiones arquitectónicas

| Decisión | Elección | Alternativa rechazada | Razón |
|---|---|---|---|
| Bootstrap y VCS | `pnpm dlx @tanstack/cli create ... --framework react --blank --package-manager pnpm --no-git --no-install --target-dir <staging> -y`; allowlist y luego `git -C <root> init` | `--force`, Git en staging o commit inicial | Evita sobrescrituras/anidamiento; revisión. |
| Calidad | Biome, TypeScript estricto y Vitest | ESLint + Prettier | Menos deriva; lockfile reproducible. |
| Mongo | Driver oficial, `MongoClient` compartido, `Db` inyectado | Mongoose, Drizzle o escrituras directas | Separa conexión, health, persistencia, adaptadores/transacciones. |
| Integraciones | Puertos con mocks, Better Auth Mongo/OAuth Provider vigente, Kimi, MCP Streamable HTTP | Live en CI o plugin MCP legado | Aísla secretos/coste; incompatibilidades explícitas. |

## Flujo de datos

```text
staging --no-git → allowlist → raíz → git init → validación VCS
Request/health → mongo-client (connect/reconnect/ping), sin índices
pnpm db:init → scripts/db-init.ts → crear/verificar índices
Request → puertos → Auth/Kimi/MCP; CI mockea externos
```

`env.server.ts` valida Zod; `MONGO_MODE=local` es predeterminado y Atlas exige opt-in. Cliente conecta/reconecta; health 200/503. Solo `db-init` consume índices; nunca requests/health/reconexión.

## Cambios de archivos

| Archivo | Acción | Descripción |
|---|---|---|
| `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `biome.json`, `vitest.config.ts` | Crear | Configuración/scripts pnpm, incluido `"db:init": "tsx scripts/db-init.ts"`. |
| `scripts/db-init.ts` | Crear | Conecta, verifica/crea índices idempotentes; cierra sin `drop`. |
| `src/server/db/{mongo-client,index-definitions,index-verifier}.ts` | Crear | Cliente conecta/reconecta/health; índices separados. |
| `.env.example`, `docker-compose.yml`, `.github/workflows/ci.yml` | Crear | Entorno/Mongo/gate; CI no muta VCS. |
| `src/server/features/`, `src/server/integrations/`, `src/routes/api/health.ts` | Crear | Puertos, health y adaptadores server-only. |
| `tests/{unit,integration,contracts,security}/`, `PRODUCT.md`, `DESIGN.md` | Crear | Pruebas/seeds pre-UI; fixture Git aislado; activos no verificados fuera. |
| `<root>/.git/` | Crear después de integrar | Raíz sin remoto, add, commit ni push. |

## Interfaces / Contratos

```ts
interface MongoClientPort { connect(): Promise<Db>; reconnect(): Promise<Db>; health(): Promise<Health>; }
type IndexDefinition = { collection: string; key: Record<string, 1 | -1> };
interface KimiPort { analyzeImage(input: ImageInput): Promise<ValidatedResult> }
interface ReadonlyToolPort { list(input: ToolInput): Promise<ReadonlyResult> }
```

Kimi: `kimi-k2.6`, imagen `data:` base64, `json_schema` simple, `finish_reason=stop`, parseo y Zod. MCP: POST/GET/DELETE, `Accept`, versión, sesión, Bearer y `Origin`; tool solo lectura. Better Auth: `@better-auth/mongo-adapter` y OAuth Provider vigente; plugin MCP legado prohibido. Gates: `PRODUCT.md` contendrá propósito, usuarios, restricciones, evidencia y accesibilidad; `DESIGN.md` contendrá modo Operate, español neutral, dirección tipográfica, prohibición de inventar tokens/componentes y regla de no incorporar fuentes/activos sin licencia y archivos verificados.

## Estrategia de pruebas

| Capa | Cobertura |
|---|---|
| Unit | Zod, cliente sin índices, declaraciones, headers, errores, redacción |
| Integración | `tests/integration/db-init.test.ts` corre `pnpm db:init` dos veces, inspecciona índices y prueba persistencia/health/reconexión sin `db:init`; `tests/integration/better-auth-mongo.test.ts` crea/recupera sesión con `@better-auth/mongo-adapter`, fuerza reconexión/nueva instancia de cliente según contrato, la recupera otra vez y demuestra persistencia; OAuth Provider incompatible falla explícitamente. |
| Contrato | `tests/contracts/bootstrap.test.ts` crea una raíz Git temporal aislada y verifica que bootstrap la inicializa sin commits ni remotos; valida staging, allowlist y `.git` no anidado. No extrapola ese estado al checkout normal de GitHub Actions; también cubre Kimi y MCP. |
| Build/CI | `pnpm install --frozen-lockfile`, lint, format, typecheck, `pnpm db:init`, tests y build; CI solo inspecciona VCS; fallo detiene gate. |

## Threat Matrix

| Boundary | Aplicabilidad | Respuesta segura/fallo | RED planificado |
|---|---|---|---|
| Documentation-like paths | N/A — Markdown/MDX/README no ejecutables | Seeds son documentación | Ninguno |
| Git repository selection | Applicable — staging y raíz son límites VCS | Rechazar cwd/ruta distinta, `.git` anidado o top-level inesperado | `bootstrap.test.ts`: raíz aislada, selectors válidos/inválidos |
| Commit state | Applicable — fixture temporal vacío; no se deduce del checkout CI | `git init` permitido; `git add/commit` o historia inesperada abortan allí | `bootstrap.test.ts`: sin commit automático |
| Push state | N/A — sin remotos ni push | CI solo inspecciona; no crea/muta remotos ni tracking | Ninguno |
| PR commands | N/A — no hay automatización PR | CI no compone/ejecuta comandos PR | Ninguno |

Scaffold/Git/Docker: cwd; fallo aborta.

## Migración / Rollout

Sin migración. Preflight `auto`, `hybrid`, `auto-chain`, 5000: validar staging, allowlist, checks y `pnpm db:init`; luego `git -C <root> init` y top-level/work-tree. Solo el fixture aislado comprueba cero remotos/commits. CI inspecciona su checkout —puede tener historia/remotos— y no muta VCS. Separar cinco work units con pruebas/evidencia/rollback; live no bloquea CI. `db-init` es idempotente/no destructivo.

## Open Questions

- [ ] Fijar con lockfile handler Start, runtime MCP y comando OAuth; incompatibilidad falla gate, sin sustituto.
