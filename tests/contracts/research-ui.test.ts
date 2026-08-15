import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/routes/app/research.tsx'),
  'utf8',
)

describe('research provenance UI contract', () => {
  it('starts empty and offers only explicit AI generation', () => {
    expect(source).toContain('Generada con Kimi')
    expect(source).toContain('Aún no hay una investigación activa')
    expect(source).toContain('Generar con IA')
    expect(source).not.toContain('Plan base por reglas')
    expect(source).toContain("generation.mode === 'kimi'")
  })
})
