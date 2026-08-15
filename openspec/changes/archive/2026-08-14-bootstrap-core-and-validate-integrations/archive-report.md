# Informe de archivo: bootstrap-core-and-validate-integrations

## Estado final

- **Artifact store:** hybrid.
- **Resultado de verificación:** PASS WITH WARNINGS.
- **Requisitos:** 4/4 conformes.
- **Escenarios:** 10/10 conformes.
- **Tareas:** 10/10 completas; el artefacto archivado no contiene tareas de implementación sin marcar.
- **Pruebas:** 48 pasadas, 0 fallidas y 1 omitida; la prueba live de Kimi permanece opt-in.
- **Build:** `pnpm build` pasó con exit 0.
- **CRITICAL:** 0.
- **Bloqueadores:** 0.

Este archivo cierra el change de fundamentos de fase 0. No afirma que el producto completo de Pokédex Manager esté implementado: UI, rutas de producto, PokéAPI, colección, chat, expediciones y fases posteriores permanecen fuera de este change.

## Artefactos Engram leídos

Se recuperó el contenido completo de los siguientes artefactos; los IDs son la trazabilidad de las observaciones realmente leídas:

| Artefacto | Observation ID |
|---|---:|
| `sdd/bootstrap-core-and-validate-integrations/proposal` | 1109 |
| `sdd/bootstrap-core-and-validate-integrations/spec` | 1113 |
| `sdd/bootstrap-core-and-validate-integrations/design` | 1116 |
| `sdd/bootstrap-core-and-validate-integrations/tasks` | 1124 |
| `sdd/bootstrap-core-and-validate-integrations/verify-report` | 1161 |

No se leyeron artefactos de review: `reviewGate` estuvo estructuralmente ausente y no se inició una review para este candidate.

## Especificaciones sincronizadas

No existían main specs para estos dominios; `openspec/specs/` solo contenía `.gitkeep`. Cada delta era un spec completo y fue copiado mecánicamente, sin merge destructivo:

| Dominio | Acción | Resultado |
|---|---|---|
| `core-bootstrap` | Created | 1 requisito, 2 escenarios |
| `environment-and-mongodb` | Created | 1 requisito, 3 escenarios |
| `integration-contracts` | Created | 1 requisito, 3 escenarios |
| `product-design-foundation` | Created | 1 requisito, 2 escenarios |

Destinos creados:

- `openspec/specs/core-bootstrap/spec.md`
- `openspec/specs/environment-and-mongodb/spec.md`
- `openspec/specs/integration-contracts/spec.md`
- `openspec/specs/product-design-foundation/spec.md`

## Evidencia de identidad mecánica

Las copias se realizaron con `cp`/`mv` desde shell. Cada `diff -r` requerido se ejecutó después de la copia temporal y después de moverla al destino; todos produjeron salida vacía.

```text
diff -r openspec/changes/bootstrap-core-and-validate-integrations/specs/core-bootstrap/spec.md <temporary destination>

diff -r openspec/changes/bootstrap-core-and-validate-integrations/specs/core-bootstrap/spec.md openspec/specs/core-bootstrap/spec.md

diff -r openspec/changes/bootstrap-core-and-validate-integrations/specs/environment-and-mongodb/spec.md <temporary destination>

diff -r openspec/changes/bootstrap-core-and-validate-integrations/specs/environment-and-mongodb/spec.md openspec/specs/environment-and-mongodb/spec.md

diff -r openspec/changes/bootstrap-core-and-validate-integrations/specs/integration-contracts/spec.md <temporary destination>

diff -r openspec/changes/bootstrap-core-and-validate-integrations/specs/integration-contracts/spec.md openspec/specs/integration-contracts/spec.md

diff -r openspec/changes/bootstrap-core-and-validate-integrations/specs/product-design-foundation/spec.md <temporary destination>

diff -r openspec/changes/bootstrap-core-and-validate-integrations/specs/product-design-foundation/spec.md openspec/specs/product-design-foundation/spec.md

diff -r <pre-move snapshot>/source openspec/changes/archive/2026-08-14-bootstrap-core-and-validate-integrations
```

La salida literal de cada comando anterior fue vacía (`diff -r` sin diferencias). El snapshot recursivo se creó antes del `mv`; `archive-report.md` se agregó después de esa comparación y, por tanto, es aditivo y no altera la prueba de identidad del árbol archivado.

## Archivo

La carpeta completa se movió mecánicamente a:

`openspec/changes/archive/2026-08-14-bootstrap-core-and-validate-integrations/`

Contiene `proposal.md`, `exploration.md`, `specs/` con los cuatro dominios, `design.md`, `tasks.md`, `verify-report.md` y este `archive-report.md`. La ruta activa `openspec/changes/bootstrap-core-and-validate-integrations/` quedó ausente. Se usó `mv` de shell en lugar de `git mv` para respetar la restricción de no modificar staging; no se ejecutaron operaciones de ramas, commits, remotos, PRs ni staging de VCS.

## Advertencias vigentes

1. `pnpm typecheck` pasa, pero conserva la advertencia no bloqueante de Node sobre la dependencia circular `replaceRouteChunk`.
2. `design.md` conserva una pregunta abierta sin marcar sobre fijar con lockfile el handler de Start, el runtime MCP y el comando OAuth; los paquetes y contratos runtime relevantes están fijados y pasan.
3. Coverage no está disponible porque `openspec/config.yaml` no declara comando de coverage y fija threshold 0.
4. La prueba live de Kimi permanece opt-in y fue omitida en esta verificación por ausencia de credenciales live.

Estas advertencias no son CRITICAL ni bloquean el cierre del change. La siguiente fase debe continuar desde los main specs sincronizados y mantener el alcance pre-UI; no debe tratar este archivo como evidencia de que el producto completo ya existe.
