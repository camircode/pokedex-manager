import '@tanstack/react-start/server-only'

import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import type {
  McpPrincipal,
  ReadonlyOperation,
  ReadonlyToolPort,
} from '@/server/integrations/mcp/contracts'
import {
  SEARCH_POKEMON_TOOL_DESCRIPTION,
  searchPokemonInputShape,
} from '@/server/integrations/mcp/contracts'

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value) ?? 'null'
  } catch {
    return JSON.stringify({ error: 'Read-only result unavailable' })
  }
}

function registerReadonlySurface(
  server: McpServer,
  port: ReadonlyToolPort,
  principal: McpPrincipal,
) {
  const pokemonIdentifierSchema = z.union([
    z.number().int().min(1).max(1025),
    z.string().trim().min(1).max(40),
  ])
  const invoke = async (
    operation: ReadonlyOperation,
    input: Readonly<Record<string, unknown>>,
  ) => {
    try {
      return await port.list({ principal, operation, input })
    } catch {
      return {
        operation,
        subject: principal.subject,
        data: { error: 'Read-only operation unavailable' },
      }
    }
  }

  const toolResult = async (
    operation: ReadonlyOperation,
    input: Readonly<Record<string, unknown>>,
  ) => ({
    content: [
      { type: 'text' as const, text: safeJson(await invoke(operation, input)) },
    ],
  })

  server.registerTool(
    'search_pokemon',
    {
      title: 'Search Pokémon',
      description: SEARCH_POKEMON_TOOL_DESCRIPTION,
      inputSchema: searchPokemonInputShape,
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => toolResult('search_pokemon', input),
  )

  server.registerTool(
    'get_pokemon',
    {
      title: 'Get Pokémon',
      description: 'Read-only Pokémon details.',
      inputSchema: { pokemonId: pokemonIdentifierSchema },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => toolResult('get_pokemon', input),
  )

  server.registerTool(
    'list_my_collection',
    {
      title: 'List my collection',
      description: 'Read-only current-user collection listing.',
      inputSchema: {
        limit: z.number().int().min(1).max(100).optional(),
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => toolResult('list_my_collection', input),
  )

  server.registerTool(
    'get_collection_stats',
    {
      title: 'Get collection stats',
      description: 'Read-only current-user collection statistics.',
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    () => toolResult('get_collection_stats', {}),
  )

  server.registerTool(
    'compare_pokemon',
    {
      title: 'Compare Pokémon',
      description: 'Read-only comparison of two Pokémon.',
      inputSchema: {
        leftId: pokemonIdentifierSchema,
        rightId: pokemonIdentifierSchema,
      },
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    (input) => toolResult('compare_pokemon', input),
  )

  server.registerTool(
    'get_research_progress',
    {
      title: 'Get research progress',
      description: 'Read-only current-user research progress.',
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    () => toolResult('get_research_progress', {}),
  )

  server.registerResource(
    'pokemon',
    new ResourceTemplate('pokedex://pokemon/{id}', { list: undefined }),
    {
      description: 'Read-only Pokémon resource.',
      mimeType: 'application/json',
    },
    async (uri, variables) => {
      const id = Number(variables.id)
      const result = await invoke('resource_pokemon', { pokemonId: id })
      return { contents: [{ uri: uri.href, text: safeJson(result) }] }
    },
  )

  server.registerResource(
    'collection',
    'collection://me',
    {
      description: 'Read-only current-user collection.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: safeJson(await invoke('resource_collection', {})),
        },
      ],
    }),
  )

  server.registerResource(
    'collection-stats',
    'collection://me/stats',
    {
      description: 'Read-only current-user collection stats.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: safeJson(await invoke('resource_collection_stats', {})),
        },
      ],
    }),
  )

  server.registerResource(
    'research-active',
    'research://me/active',
    {
      description: 'Read-only current-user research progress.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: safeJson(await invoke('resource_research_active', {})),
        },
      ],
    }),
  )
}

export function createSessionServer(
  port: ReadonlyToolPort,
  principal: McpPrincipal,
) {
  const server = new McpServer({
    name: 'pokedex-manager-mcp',
    version: '0.1.0',
  })
  registerReadonlySurface(server, port, principal)
  return server
}
