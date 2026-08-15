import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

describe('scan image preparation UI', () => {
  it('optimizes images without exposing the transport limit', () => {
    const scan = readFileSync(resolve(root, 'src/routes/app/scan.tsx'), 'utf8')

    expect(scan).toContain('optimizeScanImage(selected)')
    expect(scan).toContain('La aplicación ajusta y verifica la imagen')
    expect(scan).not.toContain('MAX_SCAN_IMAGE_BYTES')
  })
})
