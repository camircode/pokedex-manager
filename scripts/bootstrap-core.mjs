import { spawnSync } from 'node:child_process'
import {
  cp,
  lstat,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const BOOTSTRAP_SCRIPT = 'node scripts/bootstrap-core.mjs'

export const SCAFFOLD_ALLOWLIST = Object.freeze([
  '.cta.json',
  '.gitignore',
  '.vscode',
  'README.md',
  'package.json',
  'pnpm-workspace.yaml',
  'src',
  'tsconfig.json',
  'tsr.config.json',
  'vite.config.ts',
])

export class BootstrapSafetyError extends Error {
  constructor(message) {
    super(message)
    this.name = 'BootstrapSafetyError'
  }
}

function fail(message) {
  throw new BootstrapSafetyError(message)
}

async function realDirectory(name, value) {
  if (typeof value !== 'string' || !isAbsolute(value))
    fail(`${name} debe ser una ruta absoluta`)
  try {
    const info = await lstat(value)
    if (!info.isDirectory() || info.isSymbolicLink())
      fail(`${name} debe ser un directorio real: ${value}`)
    return realpath(value)
  } catch (error) {
    if (error instanceof BootstrapSafetyError) throw error
    fail(`${name} no existe: ${value}`)
  }
}

function git(root, args) {
  return spawnSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    stdio: 'pipe',
  })
}

function topLevel(root) {
  const result = git(root, ['rev-parse', '--show-toplevel'])
  return result.status === 0 ? resolve(result.stdout.trim()) : null
}

async function gitEntries(directory, allowRootGit) {
  const found = []
  async function walk(current, root) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name)
      if (entry.name === '.git') {
        if (!(root && allowRootGit)) found.push(path)
        continue
      }
      if (entry.isSymbolicLink())
        fail(`No se permiten enlaces simbólicos: ${path}`)
      if (entry.isDirectory()) await walk(path, false)
    }
  }
  await walk(directory, true)
  return found
}

async function safeRoot(root, cwd) {
  const canonicalRoot = await realDirectory('root', root)
  const canonicalCwd = await realDirectory('cwd', cwd)
  if (canonicalRoot !== canonicalCwd)
    fail(`cwd inseguro: debe coincidir con root (${canonicalRoot})`)

  const repository = topLevel(canonicalRoot)
  if (repository !== null && repository !== canonicalRoot) {
    fail(
      `Top-level Git inesperado: ${repository}; se esperaba ${canonicalRoot}`,
    )
  }
  const nested = await gitEntries(canonicalRoot, true)
  if (nested.length > 0) fail(`La raíz contiene Git anidado: ${nested[0]}`)
  return {
    root: canonicalRoot,
    repository: repository === null ? 'missing' : 'existing',
  }
}

async function safeStaging(staging) {
  const canonical = await realDirectory('staging', staging)
  const nested = await gitEntries(canonical, false)
  if (nested.length > 0) fail(`Staging contiene Git anidado: ${nested[0]}`)
  return canonical
}

async function sourceEntries(staging) {
  const entries = []
  for (const name of SCAFFOLD_ALLOWLIST) {
    try {
      const info = await lstat(join(staging, name))
      if (info.isSymbolicLink())
        fail(`La allowlist no acepta enlaces simbólicos: ${name}`)
      entries.push([name, info])
    } catch (error) {
      if (error instanceof BootstrapSafetyError) throw error
    }
  }
  if (
    !entries.some(([name]) => name === 'package.json') ||
    !entries.some(([name]) => name === 'src')
  ) {
    fail('El staging no contiene el scaffold mínimo permitido')
  }
  return entries
}

async function integrateAllowlist(root, staging) {
  const entries = await sourceEntries(staging)
  for (const [name] of entries) {
    try {
      await lstat(join(root, name))
      fail(`No se sobrescribe un destino existente: ${join(root, name)}`)
    } catch (error) {
      if (error instanceof BootstrapSafetyError) throw error
    }
  }

  const copied = []
  try {
    for (const [name, info] of entries) {
      const destination = join(root, name)
      await cp(join(staging, name), destination, {
        errorOnExist: true,
        force: false,
        recursive: info.isDirectory(),
      })
      copied.push(destination)
    }
  } catch (error) {
    await Promise.all(
      copied.map((path) => rm(path, { recursive: true, force: true })),
    )
    fail(`No se pudo integrar el staging: ${error.message}`)
  }
  return entries.map(([name]) => name)
}

async function addBootstrapScript(root) {
  const path = join(root, 'package.json')
  let manifest
  try {
    manifest = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    fail(`package.json inválido: ${error.message}`)
  }
  const existing = manifest.scripts?.bootstrap
  if (existing !== undefined && existing !== BOOTSTRAP_SCRIPT)
    fail('bootstrap incompatible ya definido')
  if (existing === BOOTSTRAP_SCRIPT) return false
  manifest.scripts = {
    ...(manifest.scripts ?? {}),
    bootstrap: BOOTSTRAP_SCRIPT,
  }
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`)
  return true
}

function createScaffold(staging, cwd) {
  const args = [
    'dlx',
    '@tanstack/cli',
    'create',
    'bootstrap',
    '--framework',
    'react',
    '--blank',
    '--package-manager',
    'pnpm',
    '--no-git',
    '--no-install',
    '--target-dir',
    staging,
    '-y',
  ]
  const result = spawnSync('pnpm', args, {
    cwd,
    env: { ...process.env, TANSTACK_CLI_TELEMETRY_DISABLED: '1' },
    stdio: 'inherit',
  })
  if (result.status !== 0)
    fail(`El scaffold TanStack Start falló con código ${result.status}`)
}

function initializeRoot(root) {
  const repository = topLevel(root)
  if (repository !== null && repository !== root)
    fail(`Top-level Git inesperado: ${repository}`)
  if (repository === root) return 'existing'
  const result = git(root, ['init'])
  if (result.status !== 0)
    fail(`No se pudo inicializar Git en la raíz: ${result.stderr.trim()}`)
  return 'initialized'
}

export async function bootstrapCore({
  root = process.cwd(),
  cwd = process.cwd(),
  staging,
} = {}) {
  const rootState = await safeRoot(root, cwd)
  const managed = staging === undefined
  const stagingPath =
    staging ?? (await mkdtemp(join(tmpdir(), 'pokedex-manager-scaffold-')))
  try {
    if (managed) {
      await safeStaging(stagingPath)
      createScaffold(stagingPath, rootState.root)
    }
    const canonicalStaging = await safeStaging(stagingPath)
    const rootRelativeToStaging = relative(canonicalStaging, rootState.root)
    if (
      rootRelativeToStaging === '' ||
      (!rootRelativeToStaging.startsWith('..') &&
        !isAbsolute(rootRelativeToStaging))
    ) {
      fail('staging y root no pueden apuntarse mutuamente')
    }
    const copiedEntries = await integrateAllowlist(
      rootState.root,
      canonicalStaging,
    )
    const bootstrapScriptAdded = await addBootstrapScript(rootState.root)
    const repository = initializeRoot(rootState.root)
    const nested = await gitEntries(rootState.root, true)
    if (nested.length > 0) fail(`La integración dejó Git anidado: ${nested[0]}`)
    return {
      root: rootState.root,
      staging: canonicalStaging,
      copiedEntries,
      bootstrapScriptAdded,
      repository,
    }
  } finally {
    if (managed) await rm(stagingPath, { recursive: true, force: true })
  }
}

function parseArguments(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--help' || argument === '-h') return { help: true }
    if (argument !== '--root' && argument !== '--staging')
      fail(`Argumento no permitido: ${argument}`)
    const value = argv[index + 1]
    if (!value) fail(`${argument} requiere una ruta`)
    options[argument.slice(2)] = value
    index += 1
  }
  return options
}

const invokedFile = process.argv[1] ? resolve(process.argv[1]) : null
if (invokedFile === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2))
    if (options.help) {
      console.log(
        'Uso: node scripts/bootstrap-core.mjs [--root <ruta>] [--staging <ruta>]',
      )
    } else {
      const result = await bootstrapCore(options)
      console.log(
        `Bootstrap completado en ${result.root}; Git: ${result.repository}.`,
      )
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  }
}
