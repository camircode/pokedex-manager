import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('contrato documental de producto y diseño', () => {
  it('conserva la verdad, los límites y la accesibilidad del producto', () => {
    const product = read('PRODUCT.md')
    expect(product).toContain('<!-- impeccable:product-schema 1 -->')
    expect(product).toMatch(/^## Plataforma\s+\nweb/m)
    expect(product).toMatch(/español neutral/i)
    expect(product).toMatch(/WCAG AA/i)
    expect(product).toMatch(/teclado/i)
    expect(product).toMatch(/movimiento reducido/i)
    expect(product).toMatch(/no hay métricas de producción/i)
    expect(product).toMatch(/licencias.*no.*verific/i)
  })

  it('fija un modo de operación y reglas materializadas', () => {
    const design = read('DESIGN.md')
    expect(design).toMatch(/^## Modo\s+\nOperación/m)
    for (const phrase of [
      'Orientación a tareas',
      'Scanabilidad',
      'Accesibilidad',
      'Responsive estructural',
      'Divulgación progresiva',
      'prefers-reduced-motion',
      'español neutral',
    ]) {
      expect(design).toMatch(new RegExp(phrase, 'i'))
    }
    expect(design).toContain('#f3f1e8')
    expect(design).toContain('#b4232f')
    expect(design).toMatch(/system-ui/)
    expect(design).toMatch(/no se incorporan fuentes ni activos de marca/i)
  })
})
