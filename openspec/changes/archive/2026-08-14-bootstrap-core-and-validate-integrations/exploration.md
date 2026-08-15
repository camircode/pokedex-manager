## Exploration: bootstrap-core-and-validate-integrations

### Current State

El workspace solo contiene `.atl/`, `openspec/` y `nuevoexamen.pdf`. No hay repositorio Git, `.codegraph/`, `package.json`, lockfile, aplicación, TypeScript, CI, runner, linter, formatter ni configuración de entorno. TanStack Start, MongoDB, Better Auth, Kimi y MCP son decisiones planificadas, no tecnologías materializadas.

Este change debe cubrir únicamente fase 0 y fundamentos: bootstrap reproducible, TypeScript estricto, calidad/CI, entorno con Zod, MongoDB local/Atlas y spikes aislados de Better Auth Mongo, Kimi multimodal con salida estructurada y MCP Streamable HTTP. Quedan fuera UI, PokéAPI, colección, chat, expediciones, rutas de producto y persistencia conversacional.

El plan de Fundaciones y la entrega exigida por `nuevoexamen.pdf` requieren que este primer change deje la raíz como repositorio Git. `--no-git` se limita al staging para evitar un repositorio anidado; después de integrar el scaffold en la raíz, la implementación debe inicializar Git allí.

La documentación primaria actualizada aporta estas restricciones verificadas:

- **TanStack CLI:** `create` genera TanStack Start con SSR por defecto; `--blank` evita UI de ejemplo y stack de pruebas; existen `--package-manager`, `--no-git`, `--no-install`, `--target-dir` y `--force`. Se debe usar exclusivamente la variante `pnpm`.
- **Better Auth MongoDB:** el paquete instalable actual es `@better-auth/mongo-adapter`; el adaptador se importa desde `better-auth/adapters/mongodb`, recibe `Db` y puede recibir `MongoClient` para transacciones. MongoDB no requiere migración/generación de esquema de Better Auth y el adaptador no gestiona índices.
- **Better Auth MCP:** el plugin legado `mcp` está deprecado; las integraciones nuevas deben evaluar `@better-auth/oauth-provider`. La compatibilidad OAuth Provider + SDK MCP debe ser un gate explícito, no una suposición.
- **Kimi:** `kimi-k2.6` acepta `image_url` con `data:` base64 y `response_format` `json_schema`. La documentación advierte inestabilidad con esquemas complejos; se necesita esquema simple, comprobación de `finish_reason`, parseo de `message.content` y segunda validación Zod.
- **MCP:** Streamable HTTP usa un endpoint con POST y GET, puede manejar DELETE para cerrar sesión, negocia versión y exige encabezados `Accept` adecuados. El servidor debe validar `Origin` y autenticación. El SDK distingue transporte para `Request`/`Response` web del transporte Node; se debe probar el runtime realmente instalado.

Antes de construir UI es viable y recomendable crear `PRODUCT.md` y un `DESIGN.md` seed. `PRODUCT.md` debe registrar propósito, usuarios, restricciones, evidencia y accesibilidad. `DESIGN.md` debe registrar reglas durables del modo Operate, español neutral y dirección tipográfica, sin inventar tokens ni componentes; las fuentes requieren verificar archivos y licencias. Esta exploración no crea esos archivos por la restricción de escritura.

### Affected Areas

- `openspec/config.yaml` — modo híbrido, `pnpm`, stack no materializado, testing capabilities y `auto-chain`.
- `nuevoexamen.pdf` — autenticación, PokéAPI, persistencia, UI responsive y bonus LMM/MCP.
- `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, configuración de TanStack/Vite y `src/` — bootstrap futuro.
- `.env.example` y módulo server-only — contrato de variables Zod, secretos y fail-fast.
- `docker-compose.yml` y conexión MongoDB — Mongo local, Atlas por URI, health check, `db:init` idempotente y reconexión sin inicialización de índices.
- Módulos server-only de Better Auth, Kimi y MCP — adaptadores aislados sin escritura directa del modelo en MongoDB.
- `tests/contracts/`, integración MongoDB y CI — contratos mockeados, pruebas reales locales y smoke opt-in.
- `PRODUCT.md` y `DESIGN.md` — gates documentales pre-UI, no sustitutos de pruebas ni implementación visual.

### Approaches

1. **Scaffold mínimo en staging y contratos primero** — generar un Start `--blank` en un directorio controlado mediante `pnpm`, con `--no-git` solo para evitar un repositorio anidado en staging y sin instalación implícita no controlada; validar, integrar en la raíz e inicializar allí Git después de la integración, preservando `openspec/`.
   - Pros: evita sobrescribir el workspace; conserva la salida oficial; separa errores de scaffold de errores de proveedores.
   - Contras: requiere merge controlado y configurar runner/calidad porque `--blank` no los incluye.
   - Esfuerzo: Medio

2. **Construcción manual en la raíz** — escribir configuración de Start, Vite, TypeScript, pruebas y adaptadores directamente.
   - Pros: control total y menos merge.
   - Contras: mayor riesgo de omitir archivos generados o usar APIs incompatibles; mezcla bootstrap con integración.
   - Esfuerzo: Alto

3. **Scaffold amplio desde el inicio** — añadir auth, PokéAPI, UI, IA, MCP y dominio completo.
   - Pros: permite un smoke end-to-end temprano.
   - Contras: viola el alcance, aumenta blast radius y hace imposible atribuir fallos; adelanta decisiones de fases posteriores.
   - Esfuerzo: Alto

### Recommendation

Recomiendo **scaffold mínimo en staging y contratos primero**. La implementación posterior debe:

1. Generar el scaffold oficial actual con React, `--blank`, `--no-git` y destino controlado; no usar `--force` sobre la raíz sin inspección previa. Tras integrar el resultado en la raíz mediante una allowlist, inicializar Git en la raíz; `--no-git` no se extiende a ese paso de implementación.
2. Materializar TypeScript estricto, lint, format, typecheck, test, build y CI, con pruebas junto a cada work unit. No inicializar Git durante esta exploración ni planificación; la implementación debe hacerlo después de integrar el scaffold en la raíz.
3. Añadir `.env.example` y parser Zod server-only por entorno; ningún secreto debe llegar al cliente.
4. Probar el driver oficial MongoDB con local reproducible y Atlas opt-in; reutilizar `MongoClient`, ejecutar `pnpm db:init` como script idempotente y explícito fuera del ciclo de requests, y mantener health/reconexión sin crear índices.
5. Ejecutar tres spikes aislados:
   - **Better Auth Mongo:** compilar con las exportaciones resueltas, crear/recuperar sesión sobre Mongo local, reconectar y comprobar persistencia; evaluar OAuth Provider sin usar el plugin MCP deprecado.
   - **Kimi:** fixture pequeña no sensible, `kimi-k2.6`, imagen base64 y `json_schema` simple; rechazar `finish_reason` inválido, JSON no parseable o resultado que no pase Zod. Mock obligatorio en CI y live opt-in separado.
   - **MCP:** cliente oficial contra el endpoint del runtime real; cubrir inicialización, tool de solo lectura, POST/GET/DELETE, sesión, `Origin`, auth, versión, `Accept`, `mcp-session-id` y errores 401/400/405.
6. Tras los contratos, crear `PRODUCT.md` y `DESIGN.md` seed antes de UI; no construir ninguna superficie en este change.

### Strategy for Contract Testing

- **Unitarias:** esquemas Zod, normalizadores, headers, límites, errores y regla de no-escritura del modelo.
- **Mongo real local:** Docker, Better Auth, conexión compartida, persistencia, ejecución repetible de `pnpm db:init` fuera de requests, reconexión sin inicialización de índices y aislamiento; Atlas repite el contrato solo con flag/secretos.
- **Kimi simulado:** MSW o stub que valide el request y respuesta; evita costo y nondeterminismo en CI.
- **Smoke live:** Kimi y Atlas/OAuth fuera de la matriz obligatoria; registrar solo modelo, versiones, status, `finish_reason` y forma del resultado, nunca claves, PII, imagen ni prompt completo.
- **MCP interoperable:** preferir cliente oficial/Inspector y probar protocolo real, no una llamada interna disfrazada de contrato.
- **CI del gate:** `pnpm install --frozen-lockfile`, lint, typecheck, unitarias, integración Mongo, contratos mockeados y build. Los nombres finales de scripts se fijan cuando exista `package.json`.

### Risks

- La raíz no está vacía para el CLI y todavía no existe baseline Git; `--force` podría sobrescribir OpenSpec o el PDF. Mitigar con staging sin Git anidado, diff allowlist e inicialización de Git en la raíz solo después de integrar.
- TanStack Start/CLI pueden cambiar templates, exports o requisitos de runtime; fijar lockfile y verificar Node/pnpm.
- Better Auth no crea índices y separa paquete instalable de path de import; el plugin MCP legado está deprecado.
- Kimi es pago y no determinista; K2.6 puede fallar con JSON Schema complejo o truncar con `finish_reason=length`.
- MCP combina protocolo, CORS/Origin, OAuth, headers y estado; un POST superficial no prueba interoperabilidad.
- Mongo local y Atlas difieren en TLS, credenciales, replica set y latencia; transacciones requieren entregar `MongoClient`.
- CI sin secretos prueba forma, no disponibilidad real; los smoke live deben ser opt-in y seguros.
- El change puede exceder la carga cognitiva si mezcla bootstrap y proveedores; con `auto-chain` y 5000 líneas, dividir por work units con rollback y evidencia.

### Ready for Proposal

Sí. El orquestador puede pasar a propuesta con alcance cerrado de fase 0 + fundamentos, gate explícito de Better Auth OAuth Provider/MCP, pruebas unitarias, Mongo real, contratos mockeados y smoke live opt-in. Debe declarar fuera de alcance toda UI y fase posterior, conservar `pnpm`, no inicializar Git durante exploración/planificación, exigir su inicialización en la raíz después de integrar el scaffold durante la implementación y tratar `PRODUCT.md`/`DESIGN.md` como documentación pre-UI.

#### Fuentes primarias consultadas

- TanStack CLI: <https://tanstack.com/cli/latest/docs/cli-reference>
- Better Auth MongoDB: <https://www.better-auth.com/docs/adapters/mongo>
- Better Auth OAuth Provider: <https://www.better-auth.com/docs/plugins/oauth-provider>
- Kimi Chat API: <https://platform.kimi.ai/docs/api/chat>
- Kimi structured output: <https://platform.kimi.ai/docs/guide/response_format>
- Kimi K2.6: <https://platform.kimi.ai/docs/guide/kimi-k2-6-quickstart>
- MCP Streamable HTTP: <https://modelcontextprotocol.io/specification/2025-06-18/basic/transports>
- MCP TypeScript SDK: <https://github.com/modelcontextprotocol/typescript-sdk>
- Zod: <https://zod.dev/>
