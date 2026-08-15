import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

describe('stylesheet architecture boundary', () => {
  it('uses a manifest with responsibility-based modules', () => {
    const manifest = readFileSync(resolve(root, 'src/styles.css'), 'utf8')
      .trim()
      .split('\n')

    expect(manifest).toEqual([
      '@import "./styles/tokens.css";',
      '@import "./styles/public.css";',
      '@import "./styles/shell.css";',
      '@import "./styles/catalog.css";',
      '@import "./styles/collection.css";',
      '@import "./styles/ai-reports.css";',
      '@import "./styles/scan.css";',
      '@import "./styles/assistant.css";',
      '@import "./styles/responsive.css";',
    ])
  })
})
