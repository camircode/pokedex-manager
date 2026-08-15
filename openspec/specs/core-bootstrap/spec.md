# Especificación de core-bootstrap

## Propósito

Base reproducible y verificable previa a UI.

## Requisitos

### Requisito: Bootstrap y calidad reproducibles

El scaffold **MUST** generarse en staging con TanStack Start `--blank`, `--no-git`, `--no-install`; usar solo `pnpm` y `pnpm-lock.yaml`; y aplicar TypeScript estricto, lint, format check, typecheck, pruebas unitarias, integración y contrato, build y CI. La integración segura **MUST** realizarse mediante una allowlist y, después de integrarla, el sistema **MUST** inicializar Git en la raíz sin crear un repositorio anidado. **MUST NOT** usar `npm`, `yarn` ni `bun` ni aprobar fallos.

#### Escenario: Instalación y CI válidos

- GIVEN una raíz integrada con lockfile y dependencias declaradas
- WHEN se ejecuta `pnpm install --frozen-lockfile` y la matriz obligatoria
- THEN la instalación es reproducible, las verificaciones pasan y `git rev-parse --is-inside-work-tree` confirma un repositorio Git válido en la raíz

#### Escenario: Herramienta o verificación prohibida

- GIVEN se usa otro gestor, se modifica el lockfile o falla una comprobación
- WHEN se ejecuta el gate
- THEN la orden o revisión se rechaza y se informa la causa
