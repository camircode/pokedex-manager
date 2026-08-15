# Tareas: bootstrap-core-and-validate-integrations

## Pronóstico de carga de revisión (Review Workload Forecast)

Líneas estimadas: 1.800–2.600; PR encadenadas: sí (PR 1 → PR 8); entrega: `auto-chain`; `chain_strategy`: `feature-branch-chain`.

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Bases: PR #1=feature/tracker; PR #2=PR #1; PR #3=PR #2; PR #4=PR #3; PR #5=PR #4; PR #6=PR #5; PR #7=PR #6; PR #8=PR #7.

### Unidades de trabajo sugeridas

| U. | Objetivo | PR | Prueba enfocada | Runtime harness | Rollback |
|---|---|---|---|---|---|
| 1 | Staging, allowlist y Git raíz | 1 | `pnpm vitest run tests/contracts/bootstrap.test.ts` | Fixture Git aislado | bootstrap, fixture, scaffold, `.git/` |
| 2 | TS estricto, Biome, Vitest, CI, lockfile | 2 | `pnpm vitest run tests/contracts/toolchain.test.ts` | `pnpm install --frozen-lockfile && pnpm test && pnpm build` | configs, lockfile, workflow |
| 3 | Zod server-only y Mongo compartido | 3 | `pnpm vitest run tests/unit/env.test.ts tests/integration/mongo-client.test.ts` | Docker local; Atlas opt-in | `.env*`, compose, `src/server/db/` |
| 4 | `pnpm db:init` e índices idempotentes | 4 | `pnpm vitest run tests/integration/db-init.test.ts` | Docker + dos `pnpm db:init` | script, índices, pruebas |
| 5 | Better Auth Mongo/OAuth/sesión | 5 | `pnpm vitest run tests/integration/better-auth-mongo.test.ts` | Mongo + reconexión/nueva instancia | adaptador y pruebas |
| 6 | Kimi mock/live y validación | 6 | `pnpm vitest run tests/contracts/kimi.test.ts` | Mock CI; live opt-in | puerto, adaptador, fixture |
| 7 | MCP Streamable HTTP autenticado e interoperable | 7 | `pnpm vitest run tests/contracts/mcp.test.ts` | SDK/Inspector oficial | transporte, auth, pruebas |
| 8 | `PRODUCT.md`/`DESIGN.md` pre-UI | 8 | `pnpm vitest run tests/contracts/product-design.test.ts` | Revisión documental + build | seeds y prueba |

## Fase 1: Bootstrap y calidad

- [x] 1.1 RED: `bootstrap.test.ts` en fixture aislado rechaza cwd/ruta, `.git` anidado, top-level inesperado y commits (Git repository selection/Commit state).
- [x] 1.2 Producción: staging `--blank --no-git --no-install`, allowlist sin sobrescritura; conservar `openspec/`, `.atl/`, PDF; `git init` solo raíz, sin remoto/commit.
- [x] 1.3 RED→GREEN `toolchain.test.ts`: pnpm-only, rechazar npm/yarn/bun, lockfile, TS estricto, Biome, Vitest, CI y build; cualquier fallo bloquea.

## Fase 2: Entorno y persistencia

- [x] 2.1 RED→GREEN `env.test.ts`/`mongo-client.test.ts`: Zod server-only, secreto expuesto, Atlas inválido, local, health 200/503 y reconexión; ningún índice fuera de `db:init`.
- [x] 2.2 RED→GREEN `db-init.test.ts`: dos ejecuciones conservan índices/persistencia; request/health/reconexión nunca lo invocan; script sin `drop`.

## Fase 3: Integraciones contractuales

- [x] 3.1 RED→GREEN Better Auth: adaptador Mongo/OAuth vigente; sesión persiste tras reconexión/nueva instancia; plugin MCP legado falla explícitamente.
- [x] 3.2 RED→GREEN Kimi: mock obligatorio/live opt-in; `kimi-k2.6`, imagen `data:`, `json_schema` simple, `finish_reason`, JSON y Zod; inválidos no escriben.
- [x] 3.3 RED→GREEN MCP: cliente oficial cubre POST/GET/DELETE, sesión, `Accept`, versión, `mcp-session-id`, Bearer, `Origin` y 401/400/405.

## Fase 4: Documentación y gate final

- [x] 4.1 RED→GREEN: validar `PRODUCT.md` (propósito, usuarios, restricciones, evidencia, accesibilidad) y `DESIGN.md` (Operate, español neutral, tipografía, sin tokens/componentes inventados).
- [x] 4.2 Gate final de fase 0: confirmar `PRODUCT.md` y `DESIGN.md` como seeds documentales; activos tipográficos y de marca quedan pendientes sin archivo/licencia verificados; ejecutar CI y confirmar ausencia de UI/fases posteriores.
