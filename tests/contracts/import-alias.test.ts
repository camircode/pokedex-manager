import { readdir, readFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const sourceRoot = resolve(projectRoot, 'src')
const generatedRouteTree = 'routeTree.gen.ts'
const relativeImportPatterns = [
  /\bfrom\s*['"]\.\.?\//,
  /\bimport\s*\(\s*['"]\.\.?\//,
  /\bimport\s*['"]\.\.?\//,
]

async function handwrittenSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) return handwrittenSourceFiles(path)
      if (!/\.tsx?$/.test(entry.name)) return []
      if (relative(sourceRoot, path) === generatedRouteTree) return []
      return [path]
    }),
  )
  return files.flat()
}

describe('internal import alias contract', () => {
  it('uses @/ for every handwritten import within src', async () => {
    const violations: string[] = []

    for (const path of await handwrittenSourceFiles(sourceRoot)) {
      const source = await readFile(path, 'utf8')
      if (relativeImportPatterns.some((pattern) => pattern.test(source))) {
        violations.push(relative(projectRoot, path))
      }
    }

    expect(
      violations,
      `${generatedRouteTree} is intentionally exempt because TanStack Router generates relative imports`,
    ).toEqual([])
  })
})
