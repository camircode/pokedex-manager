import '@tanstack/react-start/server-only'

import {
  AssistantToolLimitError,
  type AssistantToolOperation,
  MAX_ASSISTANT_TOOL_OPERATIONS,
} from '@/server/assistant/contracts'

export function routeAssistantIntent(
  message: string,
): AssistantToolOperation[] {
  const normalized = message.trim().toLowerCase()
  const comparison = normalized.match(
    /^(?:\/compare|compara|comparar)\s+([a-z0-9-]+)\s+(?:con\s+)?([a-z0-9-]+)$/,
  )
  if (comparison?.[1] && comparison[2]) {
    return [
      {
        name: 'compare_pokemon',
        input: { leftId: comparison[1], rightId: comparison[2] },
      },
    ]
  }

  const search = normalized.match(
    /^(?:\/search|busca|buscar|encuentra)\s+(.+)$/,
  )
  if (search?.[1]) {
    return [
      {
        name: 'search_pokemon',
        input: { query: search[1].slice(0, 40), limit: 5 },
      },
    ]
  }

  const details = normalized.match(
    /^(?:\/pokemon|pok[eé]mon|datos de|ficha de)\s+([a-z0-9-]+)$/,
  )
  if (details?.[1]) {
    return [{ name: 'get_pokemon', input: { pokemonId: details[1] } }]
  }

  if (normalized === '/collection' || /\bcolecci[oó]n\b/.test(normalized)) {
    return [{ name: 'list_my_collection', input: { limit: 20 } }]
  }
  if (
    normalized === '/stats' ||
    /\b(?:estad[ií]sticas|distribuci[oó]n|favoritos)\b/.test(normalized)
  ) {
    return [{ name: 'get_collection_stats', input: {} }]
  }
  if (
    normalized === '/research' ||
    /\b(?:investigaci[oó]n|expedici[oó]n|objetivos)\b/.test(normalized)
  ) {
    return [{ name: 'get_research_progress', input: {} }]
  }
  return []
}

export async function executeToolOperations<T>(
  operations: AssistantToolOperation[],
  execute: (operation: AssistantToolOperation) => Promise<T>,
) {
  if (operations.length > MAX_ASSISTANT_TOOL_OPERATIONS) {
    throw new AssistantToolLimitError()
  }
  const results: T[] = []
  for (const operation of operations) results.push(await execute(operation))
  return results
}
