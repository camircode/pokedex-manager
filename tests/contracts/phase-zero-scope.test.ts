import { readdirSync, readFileSync } from 'node:fs'
import { relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const ignoredDirectories = new Set([
  '.codegraph',
  '.git',
  '.output',
  'dist',
  'node_modules',
])
const visualAssetPattern =
  /\.(?:woff2?|ttf|otf|eot|png|jpe?g|gif|webp|ico|svg)$/i
const fontPattern = /\.(?:woff2?|ttf|otf|eot)$/i
const allowedEvidenceAssets = [
  'docs/assets/pokedex-manager-demo.gif',
  'tests/fixtures/kimi/pokemon-card.svg',
]

function readProjectFile(path: string) {
  return readFileSync(resolve(projectRoot, path), 'utf8')
}

function listProjectFiles(directory: string) {
  const files: string[] = []
  function visit(current: string) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
      const absolute = resolve(current, entry.name)
      if (entry.isDirectory()) visit(absolute)
      else if (entry.isFile()) {
        files.push(relative(projectRoot, absolute).split(sep).join('/'))
      }
    }
  }
  visit(resolve(projectRoot, directory))
  return files.sort()
}

describe('contrato de alcance del producto', () => {
  it('mantiene PRODUCT.md y DESIGN.md como autoridades actuales', () => {
    const product = readProjectFile('PRODUCT.md')
    const design = readProjectFile('DESIGN.md')
    expect(product).toContain('<!-- impeccable:product-schema 1 -->')
    expect(product).toMatch(/fuente de verdad de producto/i)
    expect(product).toMatch(/MVP ejecutable/i)
    expect(design).toMatch(/^## Modo\s+\nOperación/m)
    expect(design).toMatch(/índice de campo/i)
    expect(design).toMatch(/fuentes ni activos.*licencias.*sin verificar/i)
  })

  it('no incorpora fuentes ni activos visuales de marca sin verificar', () => {
    const visualAssets = listProjectFiles('.').filter((file) =>
      visualAssetPattern.test(file),
    )
    expect(readProjectFile('.gitignore')).toMatch(/^\*\.pdf$/m)
    expect(visualAssets.filter((file) => fontPattern.test(file))).toEqual([])
    expect(visualAssets).toEqual(allowedEvidenceAssets)
  })

  it('protege las rutas y operaciones privadas en servidor', () => {
    const appRoute = readProjectFile('src/routes/app.tsx')
    const protectedApis = [
      'src/routes/api/collection.ts',
      'src/routes/api/collection/$pokemonId.ts',
      'src/routes/api/stats.ts',
      'src/routes/api/research.ts',
      'src/routes/api/capabilities.ts',
    ]
    expect(appRoute).toContain('getSession()')
    expect(appRoute).toContain("redirect({ to: '/sign-in' })")
    for (const file of protectedApis) {
      expect(readProjectFile(file), file).toContain(
        'requireUser(request.headers)',
      )
    }
    expect(readProjectFile('src/server/collection.ts')).toMatch(
      /\{ userId, pokemonId/g,
    )
  })

  it('documenta y materializa el arranque autónomo por Compose', () => {
    const readme = readProjectFile('README.md')
    const compose = readProjectFile('docker-compose.yml')
    expect(readme).toContain('docker compose up --build')
    expect(readme).toContain('docker compose down')
    expect(compose).toContain('condition: service_healthy')
    expect(compose).toContain('MONGO_URI: mongodb://mongo:27017')
    expect(readProjectFile('Dockerfile')).toContain('scripts/db-init.ts')
  })
})
