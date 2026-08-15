import '@tanstack/react-start/server-only'

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
