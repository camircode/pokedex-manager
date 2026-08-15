import { describe, expect, it, vi } from 'vitest'

import {
  AssistantToolLimitError,
  type AssistantToolOperation,
  executeToolOperations,
  MAX_ASSISTANT_TOOL_OPERATIONS,
  routeAssistantIntent,
} from '../../src/server/assistant'

describe('deterministic assistant router', () => {
  it('routes the supported explicit tools without an AI provider', () => {
    expect(routeAssistantIntent('busca pika')).toEqual([
      { name: 'search_pokemon', input: { query: 'pika', limit: 5 } },
    ])
    expect(routeAssistantIntent('compara pikachu con raichu')).toEqual([
      {
        name: 'compare_pokemon',
        input: { leftId: 'pikachu', rightId: 'raichu' },
      },
    ])
    expect(routeAssistantIntent('/stats')).toEqual([
      { name: 'get_collection_stats', input: {} },
    ])
    expect(routeAssistantIntent('una pregunta sin herramienta')).toEqual([])
  })

  it('enforces the maximum before executing any tool', async () => {
    const operation: AssistantToolOperation = {
      name: 'get_collection_stats',
      input: {},
    }
    const execute = vi.fn(async () => 'result')
    const operations = Array.from(
      { length: MAX_ASSISTANT_TOOL_OPERATIONS + 1 },
      () => operation,
    )

    await expect(
      executeToolOperations(operations, execute),
    ).rejects.toBeInstanceOf(AssistantToolLimitError)
    expect(execute).not.toHaveBeenCalled()
  })
})
