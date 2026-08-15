import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  BootstrapSafetyError,
  bootstrapCore,
} from '../../scripts/bootstrap-core.mjs'

const temporaryRoots: string[] = []

async function createTemporaryRoot(prefix = 'pokedex-bootstrap-') {
  const root = await mkdtemp(join(tmpdir(), prefix))
  temporaryRoots.push(root)
  return root
}

async function createStaging(root: string) {
  const staging = join(root, 'staging')
  await mkdir(join(staging, 'src', 'routes'), { recursive: true })
  await writeFile(
    join(staging, 'package.json'),
    JSON.stringify({ name: 'bootstrap', private: true }, null, 2),
  )
  await writeFile(
    join(staging, 'src', 'routes', 'index.tsx'),
    'export default function Index() {}\n',
  )
  return staging
}

function initializeGit(root: string) {
  execFileSync('git', ['-C', root, 'init', '--initial-branch=main'], {
    stdio: 'pipe',
  })
}

function gitOutput(root: string, ...args: string[]) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
  }).trim()
}

afterEach(async () => {
  await Promise.all(
    temporaryRoots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('contrato de bootstrap del repositorio', () => {
  it('rechaza una raíz relativa o un cwd distinto de la raíz', async () => {
    const root = await createTemporaryRoot()
    const staging = await createStaging(root)

    await expect(
      bootstrapCore({
        root: root.slice(1),
        staging,
        runScaffold: false,
      }),
    ).rejects.toBeInstanceOf(BootstrapSafetyError)

    await expect(
      bootstrapCore({
        root,
        staging,
        cwd: join(root, 'otro-cwd'),
        runScaffold: false,
      }),
    ).rejects.toThrow(/cwd/i)
  })

  it('rechaza un staging con un repositorio Git anidado', async () => {
    const root = await createTemporaryRoot()
    const staging = await createStaging(root)
    await mkdir(join(staging, '.git'))

    await expect(
      bootstrapCore({ root, cwd: root, staging, runScaffold: false }),
    ).rejects.toThrow(/\.git|anidado/i)
  })

  it('rechaza una raíz cuyo top-level Git pertenece a otro directorio', async () => {
    const outer = await createTemporaryRoot('pokedex-outer-')
    const root = join(outer, 'proyecto-anidado')
    await mkdir(root)
    const staging = await createStaging(outer)
    initializeGit(outer)

    await expect(
      bootstrapCore({ root, cwd: root, staging, runScaffold: false }),
    ).rejects.toThrow(/top-level|repositorio/i)
  })

  it('rechaza destinos preexistentes y no sobrescribe su contenido', async () => {
    const root = await createTemporaryRoot()
    const staging = await createStaging(root)
    const existing = JSON.stringify({ name: 'preexistente' })
    await writeFile(join(root, 'package.json'), existing)

    await expect(
      bootstrapCore({ root, cwd: root, staging, runScaffold: false }),
    ).rejects.toThrow(/existente|sobrescribir/i)
    await expect(readFile(join(root, 'package.json'), 'utf8')).resolves.toBe(
      existing,
    )
  })

  it('conserva .atl, openspec y el PDF fuera de la allowlist', async () => {
    const root = await createTemporaryRoot()
    const staging = await createStaging(root)
    await mkdir(join(root, '.atl'))
    await mkdir(join(root, 'openspec'))
    await writeFile(join(root, '.atl', 'keep.txt'), 'atl original')
    await writeFile(join(root, 'openspec', 'keep.md'), 'openspec original')
    await writeFile(join(root, 'nuevoexamen.pdf'), 'pdf original')
    initializeGit(root)

    await expect(
      bootstrapCore({ root, cwd: root, staging, runScaffold: false }),
    ).resolves.toMatchObject({ repository: 'existing' })
    await expect(
      readFile(join(root, '.atl', 'keep.txt'), 'utf8'),
    ).resolves.toBe('atl original')
    await expect(
      readFile(join(root, 'openspec', 'keep.md'), 'utf8'),
    ).resolves.toBe('openspec original')
    await expect(readFile(join(root, 'nuevoexamen.pdf'), 'utf8')).resolves.toBe(
      'pdf original',
    )
    await expect(
      readFile(join(root, 'src', 'routes', 'index.tsx'), 'utf8'),
    ).resolves.toContain('function Index')
  })

  it('inicializa únicamente la raíz sin commits, remotos ni Git anidado', async () => {
    const root = await createTemporaryRoot()
    const staging = await createStaging(root)

    await expect(
      bootstrapCore({ root, cwd: root, staging, runScaffold: false }),
    ).resolves.toMatchObject({ repository: 'initialized' })
    expect(gitOutput(root, 'rev-parse', '--is-inside-work-tree')).toBe('true')
    expect(() => gitOutput(root, 'rev-parse', '--verify', 'HEAD')).toThrow()
    expect(gitOutput(root, 'remote')).toBe('')
    await expect(
      readFile(join(root, 'src', 'routes', 'index.tsx'), 'utf8'),
    ).resolves.toContain('function Index')
    await expect(
      readFile(join(root, 'staging', '.git'), 'utf8'),
    ).rejects.toThrow()
  })
})
