import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  resolve(process.cwd(), 'src/routes/app/research.tsx'),
  'utf8',
)

describe('research UI contract', () => {
  it('starts empty and presents generated research without redundant labels', () => {
    expect(source).toContain('Aún no hay una investigación activa')
    expect(source).toContain('Generar con IA')
    expect(source).toContain('<h2>Investigación de colección</h2>')
    expect(source).not.toContain('Generada con Kimi')
    expect(source).not.toContain('Narrativa generada')
    expect(source).not.toContain('Plan base por reglas')
  })
})
