import '@tanstack/react-start/server-only'

import { z } from 'zod'

import {
  CATALOG_SORTS,
  POKEMON_GENERATIONS,
  POKEMON_TYPES,
} from '@/lib/catalog-query'

export const SEARCH_POKEMON_TOOL_DESCRIPTION =
  'Search the Pokémon catalog by name or structured attributes. Omit query for filter-only searches and use type, generation, ability, category, and sort instead of placing attribute labels in query.'

export const searchPokemonInputShape = {
  query: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .optional()
    .describe(
      'Optional Pokémon name or numeric ID fragment. Do not use for type, generation, ability, or category.',
    ),
  type: z
    .enum(POKEMON_TYPES)
    .optional()
    .describe(
      'Canonical English type identifier, for example fire or grass. Translate user-facing labels before calling.',
    ),
  generation: z
    .enum(POKEMON_GENERATIONS)
    .optional()
    .describe(
      'Canonical generation identifier from generation-i through generation-ix.',
    ),
  ability: z
    .string()
    .trim()
    .toLowerCase()
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .optional()
    .describe('Canonical English ability identifier, for example chlorophyll.'),
  category: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[\p{L}\p{N} .'-]+$/u)
    .optional()
    .describe('Pokédex category label, for example Seed Pokémon.'),
  sort: z
    .enum(CATALOG_SORTS)
    .optional()
    .describe(
      'Result order. Use a descending stat sort such as attack-desc when recommending strong candidates.',
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Maximum number of catalog matches to return.'),
}

export const searchPokemonInputSchema = z
  .object(searchPokemonInputShape)
  .strict()

export type McpPrincipal = {
  subject: string
  scopes?: readonly string[]
}

export type McpBearerVerifier = (
  token: string,
  request: Request,
) => McpPrincipal | undefined | Promise<McpPrincipal | undefined>

export type ReadonlyOperation =
  | 'search_pokemon'
  | 'get_pokemon'
  | 'list_my_collection'
  | 'get_collection_stats'
  | 'compare_pokemon'
  | 'get_research_progress'
  | 'resource_pokemon'
  | 'resource_collection'
  | 'resource_collection_stats'
  | 'resource_research_active'

export const MCP_TOOL_NAMES = [
  'search_pokemon',
  'get_pokemon',
  'list_my_collection',
  'get_collection_stats',
  'compare_pokemon',
  'get_research_progress',
] as const

export type McpToolName = (typeof MCP_TOOL_NAMES)[number]

export type ReadonlyPortInput = {
  principal: McpPrincipal
  operation: ReadonlyOperation
  input: Readonly<Record<string, unknown>>
}

export type ReadonlyResult = {
  operation: ReadonlyOperation
  subject: string
  data: unknown
}

export interface ReadonlyToolPort {
  list(input: ReadonlyPortInput): Promise<ReadonlyResult>
}

export type McpEndpointOptions = {
  verifyBearer?: McpBearerVerifier
  readonlyPort?: ReadonlyToolPort
  allowedOrigins?: readonly string[]
  maxSessions?: number
  sessionTtlMs?: number
  sessionIdGenerator?: () => string
}

export type McpEndpoint = {
  handle(request: Request): Promise<Response>
  close(): Promise<void>
  getSessionCount(): number
}

export class McpClientError extends Error {
  readonly status = 503

  constructor() {
    super('MCP context request failed')
    this.name = 'McpClientError'
  }
}
