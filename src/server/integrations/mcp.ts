import '@tanstack/react-start/server-only'

import { randomUUID, timingSafeEqual } from 'node:crypto'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import {
  McpServer,
  ResourceTemplate,
} from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  isInitializeRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'

import { getCatalogService } from '@/server/catalog'
import { getCollectionService } from '@/server/collection'
import { getCurrentResearch } from '@/server/research'

const MCP_ALLOW_METHODS = 'GET, POST, DELETE'
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const
const SUPPORTED_PROTOCOL_VERSION_SET = new Set(SUPPORTED_PROTOCOL_VERSIONS)
const SESSION_ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/

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

type SessionEntry = {
  id: string
  principal: McpPrincipal
  server: McpServer
  transport: WebStandardStreamableHTTPServerTransport
  lastUsedAt: number
}

type AuthenticatedRequest = {
  token: string
  principal: McpPrincipal
}

const emptyReadonlyPort: ReadonlyToolPort = {
  async list(input) {
    return {
      operation: input.operation,
      subject: input.principal.subject,
      data: { items: [] },
    }
  },
}

function invalidMcpRequest(status = 400) {
  return Response.json(
    {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid MCP request' },
      id: null,
    },
    {
      status,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

function unauthorized() {
  return Response.json(
    { error: 'Unauthorized' },
    {
      status: 401,
      headers: {
        'Cache-Control': 'no-store',
        'WWW-Authenticate': 'Bearer',
      },
    },
  )
}

function forbiddenOrigin() {
  return Response.json(
    { error: 'Forbidden origin' },
    {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}

function methodNotAllowed() {
  return Response.json(
    { error: 'Method not allowed' },
    {
      status: 405,
      headers: {
        Allow: MCP_ALLOW_METHODS,
        'Cache-Control': 'no-store',
      },
    },
  )
}

function hasMediaType(header: string | null, expected: string) {
  if (header === null) return false
  return header.split(',').some((part) => {
    const mediaType = part.trim().split(';', 1)[0]?.toLowerCase()
    return mediaType === expected
  })
}

function isJsonContentType(header: string | null) {
  if (header === null) return false
  return header.split(';', 1)[0]?.trim().toLowerCase() === 'application/json'
}

function safeJson(value: unknown) {
  try {
    return JSON.stringify(value) ?? 'null'
  } catch {
    return JSON.stringify({ error: 'Read-only result unavailable' })
  }
}

function isValidPrincipal(
  value: McpPrincipal | undefined,
): value is McpPrincipal {
  return (
    value !== undefined &&
    typeof value.subject === 'string' &&
    value.subject.trim().length > 0 &&
    value.subject.length <= 128 &&
    !value.subject.includes('\n')
  )
}

function authInfo(authenticated: AuthenticatedRequest): AuthInfo {
  return {
    token: authenticated.token,
    clientId: authenticated.principal.subject,
    scopes: [...(authenticated.principal.scopes ?? [])],
  }
}

class SessionRegistry {
  private readonly sessions = new Map<string, SessionEntry>()

  constructor(
    private readonly maxSessions: number,
    private readonly sessionTtlMs: number,
  ) {}

  async prune(now = Date.now()) {
    const expired = [...this.sessions.values()].filter(
      (entry) => now - entry.lastUsedAt > this.sessionTtlMs,
    )
    for (const entry of expired) await this.closeEntry(entry)
  }

  async add(entry: SessionEntry) {
    await this.prune()

    while (this.sessions.size >= this.maxSessions) {
      const oldest = this.sessions.values().next().value as
        | SessionEntry
        | undefined
      if (oldest === undefined) break
      await this.closeEntry(oldest)
    }

    this.sessions.set(entry.id, entry)
  }

  get(id: string) {
    const entry = this.sessions.get(id)
    if (entry === undefined) return undefined

    entry.lastUsedAt = Date.now()
    this.sessions.delete(id)
    this.sessions.set(id, entry)
    return entry
  }

  remove(id: string) {
    this.sessions.delete(id)
  }

  count() {
    return this.sessions.size
  }

  async closeEntry(entry: SessionEntry) {
    if (!this.sessions.delete(entry.id)) return
    await entry.server.close().catch(() => undefined)
  }

  async closeAll() {
    const entries = [...this.sessions.values()]
    this.sessions.clear()
    await Promise.all(
      entries.map((entry) => entry.server.close().catch(() => undefined)),
    )
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
      description: 'Read-only Pokémon search.',
      inputSchema: {
        query: z.string().trim().min(1).max(80),
        limit: z.number().int().min(1).max(20).optional(),
      },
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

function createSessionServer(port: ReadonlyToolPort, principal: McpPrincipal) {
  const server = new McpServer({
    name: 'pokedex-manager-mcp',
    version: '0.1.0',
  })
  registerReadonlySurface(server, port, principal)
  return server
}

function parseToolResult(
  result: unknown,
  principal: McpPrincipal,
  operation: McpToolName,
) {
  if (typeof result !== 'object' || result === null) throw new McpClientError()
  if ('isError' in result && result.isError === true) throw new McpClientError()
  const content = 'content' in result ? result.content : undefined
  if (!Array.isArray(content)) throw new McpClientError()
  const text = content.find(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      'type' in entry &&
      entry.type === 'text' &&
      'text' in entry &&
      typeof entry.text === 'string',
  )?.text
  if (text === undefined) throw new McpClientError()

  try {
    const parsed = JSON.parse(text) as unknown
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('operation' in parsed) ||
      parsed.operation !== operation ||
      !('subject' in parsed) ||
      parsed.subject !== principal.subject ||
      !('data' in parsed)
    ) {
      throw new McpClientError()
    }
    return parsed as ReadonlyResult
  } catch (error) {
    if (error instanceof McpClientError) throw error
    throw new McpClientError()
  }
}

export async function createMcpToolClient(
  principal: McpPrincipal,
  port: ReadonlyToolPort = productReadonlyPort,
) {
  const server = createSessionServer(port, principal)
  const client = new Client(
    { name: 'pokedex-manager-assistant', version: '0.1.0' },
    { capabilities: {} },
  )
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()

  try {
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport),
    ])
  } catch {
    await Promise.allSettled([client.close(), server.close()])
    throw new McpClientError()
  }

  let closed = false
  return {
    async listTools() {
      try {
        return (await client.listTools()).tools
      } catch {
        throw new McpClientError()
      }
    },
    async callTool(
      operation: McpToolName,
      input: Readonly<Record<string, unknown>>,
    ) {
      try {
        const result = await client.callTool({
          name: operation,
          arguments: input,
        })
        return parseToolResult(result, principal, operation)
      } catch (error) {
        if (error instanceof McpClientError) throw error
        throw new McpClientError()
      }
    },
    async close() {
      if (closed) return
      closed = true
      await Promise.allSettled([client.close(), server.close()])
    },
  }
}

export type McpToolClient = Awaited<ReturnType<typeof createMcpToolClient>>

function protocolVersionFromInitialize(payload: unknown) {
  if (Array.isArray(payload)) {
    const initialize = payload.find((message) => isInitializeRequest(message))
    return initialize?.params.protocolVersion
  }
  return isInitializeRequest(payload)
    ? payload.params.protocolVersion
    : undefined
}

function hasInitializeRequest(payload: unknown) {
  return Array.isArray(payload)
    ? payload.some((message) => isInitializeRequest(message))
    : isInitializeRequest(payload)
}

function validProtocolVersion(version: string | undefined) {
  return version === undefined || SUPPORTED_PROTOCOL_VERSION_SET.has(version)
}

function readSessionId(request: Request) {
  const raw = request.headers.get('mcp-session-id')
  if (raw === null) return { value: undefined, valid: true }
  const value = raw.trim()
  return { value, valid: SESSION_ID_PATTERN.test(value) }
}

class McpEndpointImpl implements McpEndpoint {
  private readonly registry: SessionRegistry
  private readonly verifyBearer: McpBearerVerifier
  private readonly readonlyPort: ReadonlyToolPort
  private readonly allowedOrigins: ReadonlySet<string>
  private readonly sessionIdGenerator: () => string

  constructor(options: McpEndpointOptions) {
    const maxSessions = options.maxSessions ?? 32
    const sessionTtlMs = options.sessionTtlMs ?? 30 * 60 * 1_000
    if (
      !Number.isInteger(maxSessions) ||
      maxSessions < 1 ||
      maxSessions > 1_000
    ) {
      throw new Error('Invalid MCP session configuration')
    }
    if (!Number.isInteger(sessionTtlMs) || sessionTtlMs < 1) {
      throw new Error('Invalid MCP session configuration')
    }

    this.registry = new SessionRegistry(maxSessions, sessionTtlMs)
    this.verifyBearer = options.verifyBearer ?? (async () => undefined)
    this.readonlyPort = options.readonlyPort ?? emptyReadonlyPort
    this.allowedOrigins = new Set(
      options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS,
    )
    this.sessionIdGenerator = () => {
      const value = options.sessionIdGenerator?.() ?? randomUUID()
      if (!SESSION_ID_PATTERN.test(value))
        throw new Error('Invalid MCP session configuration')
      return value
    }
  }

  async handle(request: Request) {
    await this.registry.prune()

    const authenticated = await this.authenticate(request)
    if (authenticated === undefined) return unauthorized()

    const origin = request.headers.get('origin')
    if (origin !== null && !this.allowedOrigins.has(origin)) {
      return forbiddenOrigin()
    }

    const method = request.method.toUpperCase()
    if (method !== 'GET' && method !== 'POST' && method !== 'DELETE') {
      return methodNotAllowed()
    }

    const session = readSessionId(request)
    if (!session.valid) return invalidMcpRequest()

    if (method === 'POST') {
      return this.handlePost(request, authenticated, session.value)
    }

    if (
      !hasMediaType(request.headers.get('accept'), 'text/event-stream') &&
      method === 'GET'
    ) {
      return invalidMcpRequest(406)
    }

    if (session.value === undefined) return invalidMcpRequest()
    if (
      !validProtocolVersion(
        request.headers.get('mcp-protocol-version') ?? undefined,
      )
    ) {
      return invalidMcpRequest()
    }

    const entry = this.registry.get(session.value)
    if (entry === undefined) return invalidMcpRequest()
    if (entry.principal.subject !== authenticated.principal.subject) {
      return unauthorized()
    }

    return this.dispatch(entry, request, authenticated)
  }

  async close() {
    await this.registry.closeAll()
  }

  getSessionCount() {
    return this.registry.count()
  }

  private async authenticate(
    request: Request,
  ): Promise<AuthenticatedRequest | undefined> {
    const header = request.headers.get('authorization')
    if (header === null) return undefined
    const match = /^Bearer ([^\s]+)$/.exec(header)
    if (match === null) return undefined

    try {
      const principal = await this.verifyBearer(match[1], request)
      if (!isValidPrincipal(principal)) return undefined
      return { token: match[1], principal }
    } catch {
      return undefined
    }
  }

  private async handlePost(
    request: Request,
    authenticated: AuthenticatedRequest,
    sessionId: string | undefined,
  ) {
    if (
      !hasMediaType(request.headers.get('accept'), 'application/json') ||
      !hasMediaType(request.headers.get('accept'), 'text/event-stream')
    ) {
      return invalidMcpRequest(406)
    }
    if (!isJsonContentType(request.headers.get('content-type'))) {
      return invalidMcpRequest(415)
    }

    let payload: unknown
    try {
      payload = await request.clone().json()
    } catch {
      return invalidMcpRequest()
    }

    const protocolHeader =
      request.headers.get('mcp-protocol-version') ?? undefined
    if (!validProtocolVersion(protocolHeader)) return invalidMcpRequest()

    if (hasInitializeRequest(payload)) {
      if (sessionId !== undefined) return invalidMcpRequest()
      if (!validProtocolVersion(protocolVersionFromInitialize(payload))) {
        return invalidMcpRequest()
      }

      return this.initializeSession(request, authenticated)
    }

    if (sessionId === undefined) return invalidMcpRequest()
    const entry = this.registry.get(sessionId)
    if (entry === undefined) return invalidMcpRequest()
    if (entry.principal.subject !== authenticated.principal.subject) {
      return unauthorized()
    }
    return this.dispatch(entry, request, authenticated)
  }

  private async initializeSession(
    request: Request,
    authenticated: AuthenticatedRequest,
  ) {
    let entry: SessionEntry | undefined
    const server = createSessionServer(
      this.readonlyPort,
      authenticated.principal,
    )
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: this.sessionIdGenerator,
      enableJsonResponse: true,
      onsessioninitialized: async (id) => {
        if (entry === undefined)
          throw new Error('MCP session initialization failed')
        entry.id = id
        await this.registry.add(entry)
      },
      onsessionclosed: async (id) => {
        this.registry.remove(id)
      },
    })
    entry = {
      id: '',
      principal: authenticated.principal,
      server,
      transport,
      lastUsedAt: Date.now(),
    }
    transport.onclose = () => {
      if (entry?.id !== '') this.registry.remove(entry?.id ?? '')
    }

    await server.connect(transport)
    const response = await this.dispatch(entry, request, authenticated)
    if (response.status >= 400 && entry.id !== '') {
      await this.registry.closeEntry(entry)
    }
    return response
  }

  private async dispatch(
    entry: SessionEntry,
    request: Request,
    authenticated: AuthenticatedRequest,
  ) {
    try {
      const response = await entry.transport.handleRequest(request, {
        authInfo: authInfo(authenticated),
      })
      if (response.status >= 400) return invalidMcpRequest(response.status)
      return response
    } catch {
      return invalidMcpRequest()
    }
  }
}

export function createMcpEndpoint(
  options: McpEndpointOptions = {},
): McpEndpoint {
  return new McpEndpointImpl(options)
}

export function getMcpHttpCapability(input: NodeJS.ProcessEnv = process.env) {
  const token = input.MCP_BEARER_TOKEN?.trim()
  const subject = input.MCP_SUBJECT?.trim()
  return (
    token !== undefined &&
    token.length >= 24 &&
    subject !== undefined &&
    subject.length > 0
  )
}

function configuredBearerVerifier(): McpBearerVerifier {
  const expected = process.env.MCP_BEARER_TOKEN?.trim()
  const subject = process.env.MCP_SUBJECT?.trim()
  return async (token) => {
    if (
      expected === undefined ||
      expected.length < 24 ||
      subject === undefined ||
      subject.length === 0 ||
      token.length !== expected.length
    ) {
      return undefined
    }
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected))
      ? { subject }
      : undefined
  }
}

export const productReadonlyPort: ReadonlyToolPort = {
  async list({ principal, operation, input }) {
    const catalog = await getCatalogService()
    const collection = await getCollectionService()
    let data: unknown
    switch (operation) {
      case 'search_pokemon':
        data = await catalog.list({
          query: input.query,
          limit: input.limit ?? 20,
          page: 1,
        })
        break
      case 'get_pokemon':
      case 'resource_pokemon':
        data = await catalog.getPokemon(String(input.pokemonId))
        break
      case 'list_my_collection':
        data = (await collection.list(principal.subject)).slice(
          0,
          typeof input.limit === 'number' ? input.limit : 20,
        )
        break
      case 'resource_collection':
        data = await collection.list(principal.subject)
        break
      case 'get_collection_stats':
      case 'resource_collection_stats':
        data = await collection.stats(principal.subject)
        break
      case 'get_research_progress':
      case 'resource_research_active':
        data = await getCurrentResearch(principal.subject)
        break
      case 'compare_pokemon':
        data = await Promise.all([
          catalog.getPokemon(String(input.leftId)),
          catalog.getPokemon(String(input.rightId)),
        ])
        break
    }
    return { operation, subject: principal.subject, data }
  },
}

const defaultMcpEndpoint = createMcpEndpoint({
  verifyBearer: configuredBearerVerifier(),
  readonlyPort: productReadonlyPort,
})

export function mcpHandler(request: Request) {
  return defaultMcpEndpoint.handle(request)
}
