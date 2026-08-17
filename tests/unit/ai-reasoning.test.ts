import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { AiReasoning, reasoningItems } from '../../src/components/ai-reasoning'

describe('AI reasoning disclosure', () => {
  it('derives concise step titles from the provider text', () => {
    const items = reasoningItems(`Estado actual:
- Una especie registrada

Candidatos:
- Registrar una especie de tipo fuego

Debo recomendar un siguiente paso concreto. La colección todavía es pequeña.`)

    expect(items.map((item) => item.content)).toEqual([
      'Estado actual:',
      'Candidatos:',
      'Debo recomendar un siguiente paso concreto.',
    ])
    expect(items.every((item) => item.detail !== undefined)).toBe(true)
  })

  it('renders a visible disclosure for the group and every step', () => {
    const markup = renderToStaticMarkup(
      createElement(AiReasoning, {
        items: reasoningItems('Primer paso.\n\nSegundo paso.'),
        streaming: false,
      }),
    )

    expect(markup).toContain('prompt-steps-trigger')
    expect(markup.match(/prompt-steps-item-trigger/g)).toHaveLength(2)
    expect(markup.match(/prompt-steps-item-chevron/g)).toHaveLength(2)
    expect(markup.match(/hn-sparkles/g)).toHaveLength(2)
  })
})
