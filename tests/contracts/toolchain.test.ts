import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

type PackageManifest = {
  packageManager?: string
  engines?: Record<string, string>
  scripts?: Record<string, string>
  devDependencies?: Record<string, string>
}

const forbiddenCommandPattern =
  /\b(?:npm|yarn|bun)(?:\s+(?:ci|install|run|exec|test|build|lint|format))?\b/i
const forbiddenLockfiles = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'yarn.lock',
  'bun.lock',
  'bun.lockb',
]

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), 'utf8')
}

function readManifest(): PackageManifest {
  return JSON.parse(readProjectFile('package.json')) as PackageManifest
}

describe('toolchain contract', () => {
  it('declares pnpm as the only package manager and rejects forbidden artifacts', () => {
    const manifest = readManifest()

    expect(manifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+$/)
    expect(manifest.engines?.pnpm).toBeDefined()
    expect(manifest.scripts).toBeDefined()

    for (const lockfile of forbiddenLockfiles) {
      expect(existsSync(resolve(projectRoot, lockfile)), lockfile).toBe(false)
    }

    const policyFiles = [
      'package.json',
      'pnpm-workspace.yaml',
      '.github/workflows/ci.yml',
      'README.md',
      'scripts/bootstrap-core.mjs',
      'vite.config.ts',
      'vitest.config.mjs',
    ]

    for (const file of policyFiles) {
      expect(readProjectFile(file), file).not.toMatch(forbiddenCommandPattern)
    }
  })

  it('declares a frozen lockfile and local quality tooling', () => {
    const manifest = readManifest()
    const scripts = manifest.scripts ?? {}
    const devDependencies = manifest.devDependencies ?? {}

    expect(existsSync(resolve(projectRoot, 'pnpm-lock.yaml'))).toBe(true)
    const lockfile = readProjectFile('pnpm-lock.yaml')

    expect(lockfile).toMatch(/^lockfileVersion:/m)
    expect(lockfile).not.toMatch(/specifier:\s+latest/)
    expect(devDependencies['@biomejs/biome']).toBeDefined()
    expect(devDependencies.vitest).toBeDefined()

    for (const script of [
      'lint',
      'format',
      'format:check',
      'typecheck',
      'test',
      'build',
      'smoke',
    ]) {
      expect(scripts[script], `missing ${script} script`).toBeDefined()
    }
  })

  it('enables strict TypeScript, Biome checks, Vitest and a pnpm CI gate', () => {
    const tsconfig = readProjectFile('tsconfig.json')
    const biome = JSON.parse(readProjectFile('biome.json')) as {
      formatter?: { enabled?: boolean }
      linter?: {
        enabled?: boolean
        rules?: { recommended?: boolean; preset?: string }
      }
    }
    const vitestConfig = existsSync(resolve(projectRoot, 'vitest.config.ts'))
      ? readProjectFile('vitest.config.ts')
      : readProjectFile('vitest.config.mjs')
    const workflow = readProjectFile('.github/workflows/ci.yml')

    expect(tsconfig).toMatch(/"strict"\s*:\s*true/)
    expect(tsconfig).toMatch(/"noEmit"\s*:\s*true/)
    expect(biome.formatter?.enabled).toBe(true)
    expect(biome.linter?.enabled).toBe(true)
    expect(
      biome.linter?.rules?.recommended ?? biome.linter?.rules?.preset,
    ).toBeTruthy()
    expect(vitestConfig).toMatch(/defineConfig|test\s*:/)
    expect(workflow).toMatch(/pnpm install --frozen-lockfile/)
    expect(workflow).toMatch(/services:\s+mongo:/s)
    expect(workflow).toMatch(/pnpm db:init/)
    expect(workflow).toMatch(
      /pnpm (?:run )?(?:lint|format:check|typecheck|test|build)/,
    )
    expect(workflow).not.toMatch(/git\s+(?:add|commit|push|remote\s+add)\b/i)
  })

  it('keeps unused OAuth providers out of the production dependency graph', () => {
    const manifest = readManifest()
    const dependencies = JSON.parse(readProjectFile('package.json')) as {
      dependencies?: Record<string, string>
    }
    expect(dependencies.dependencies?.['@better-auth/oauth-provider']).toBe(
      undefined,
    )
    expect(readProjectFile('pnpm-lock.yaml')).not.toContain(
      "'@better-auth/oauth-provider':",
    )
    expect(manifest.scripts?.['audit:prod']).toBeDefined()
  })
})
