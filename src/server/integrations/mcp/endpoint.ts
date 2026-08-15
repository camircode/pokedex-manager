import '@tanstack/react-start/server-only'

import { randomUUID } from 'node:crypto'

import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import {
  isInitializeRequest,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js'

import type {
  McpBearerVerifier,
  McpEndpoint,
  McpEndpointOptions,
  McpPrincipal,
  ReadonlyToolPort,
} from '@/server/integrations/mcp/contracts'
import { createSessionServer } from '@/server/integrations/mcp/surface'

const MCP_ALLOW_METHODS = 'GET, POST, DELETE'
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
] as const
const SUPPORTED_PROTOCOL_VERSION_SET = new Set(SUPPORTED_PROTOCOL_VERSIONS)
const SESSION_ID_PATTERN = /^[A-Za-z0-9._~-]{1,128}$/

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
