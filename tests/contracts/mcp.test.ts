import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer, type IncomingMessage, type Server } from 'node:http'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import {
  LATEST_PROTOCOL_VERSION,
  SUPPORTED_PROTOCOL_VERSIONS,
} from '@modelcontextprotocol/sdk/types.js'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createMcpEndpoint,
  createMcpToolClient,
  getMcpHttpCapability,
  type ReadonlyPortInput,
  type ReadonlyToolPort,
} from '../../src/server/integrations/mcp'

const allowedOrigin = 'https://mcp-client.example'
const validTokenA = 'fixture-token-user-a'
const validTokenB = 'fixture-token-user-b'

describe('MCP HTTP configuration', () => {
  it('requires both a strong bearer and an explicit subject', () => {
    expect(
      getMcpHttpCapability({
        MCP_BEARER_TOKEN: 'a-secure-token-with-24-characters',
        MCP_SUBJECT: 'user-a',
      }),
    ).toBe(true)
    expect(
      getMcpHttpCapability({
        MCP_BEARER_TOKEN: 'a-secure-token-with-24-characters',
      }),
    ).toBe(false)
    expect(
      getMcpHttpCapability({
        MCP_BEARER_TOKEN: 'short',
        MCP_SUBJECT: 'user-a',
      }),
    ).toBe(false)
  })
})

type HttpHarness = {
  baseUrl: string
  endpoint: ReturnType<typeof createMcpEndpoint>
  requests: Array<{ method: string; status: number }>
  close: () => Promise<void>
}

const openHarnesses: HttpHarness[] = []

function jsonRpcInitialize(protocolVersion = LATEST_PROTOCOL_VERSION) {
  return {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion,
      capabilities: {},
      clientInfo: { name: 'mcp-contract-client', version: '1.0.0' },
    },
  }
}

function headersToWebRequest(headers: IncomingMessage['headers']) {
  const result = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (value === undefined) continue
    result.set(name, Array.isArray(value) ? value.join(', ') : value)
  }
  return result
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

async function writeWebResponse(
  response: Response,
  nodeResponse: import('node:http').ServerResponse,
) {
  const responseHeaders = Object.fromEntries(response.headers.entries())
  nodeResponse.writeHead(response.status, responseHeaders)

  if (response.body === null) {
    nodeResponse.end()
    return
  }

  const reader = response.body.getReader()
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      if (!nodeResponse.destroyed) nodeResponse.write(next.value)
    }
  } catch {
    if (!nodeResponse.destroyed) nodeResponse.end()
    return
  }

  if (!nodeResponse.destroyed) nodeResponse.end()
}

async function startHttpHarness(
  endpoint: ReturnType<typeof createMcpEndpoint>,
): Promise<HttpHarness> {
  const requests: Array<{ method: string; status: number }> = []
  const server: Server = createServer(async (nodeRequest, nodeResponse) => {
    const method = nodeRequest.method ?? 'GET'
    const url = new URL(
      nodeRequest.url ?? '/',
      `http://${nodeRequest.headers.host ?? '127.0.0.1'}`,
    )
    const body =
      method === 'GET' || method === 'HEAD'
        ? undefined
        : await readRequestBody(nodeRequest)

    const request = new Request(url, {
      method,
      headers: headersToWebRequest(nodeRequest.headers),
      body,
    })
    const response = await endpoint.handle(request)
    requests.push({ method, status: response.status })
    await writeWebResponse(response, nodeResponse)
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') {
    server.close()
    throw new Error('MCP runtime harness did not expose a TCP address')
  }

  const harness: HttpHarness = {
    baseUrl: `http://127.0.0.1:${address.port}/api/mcp`,
    endpoint,
    requests,
    close: async () => {
      await endpoint.close()
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error === undefined) resolve()
          else reject(error)
        })
      })
    },
  }
  openHarnesses.push(harness)
  return harness
}

function createFixturePort(calls: ReadonlyPortInput[]) {
  const port: ReadonlyToolPort = {
    async list(input) {
      calls.push(input)
      return {
        operation: input.operation,
        subject: input.principal.subject,
        data: {
          subject: input.principal.subject,
          operation: input.operation,
          input: input.input,
        },
      }
    },
  }
  return port
}

function createFixtureEndpoint(calls: ReadonlyPortInput[] = []) {
  return createMcpEndpoint({
    allowedOrigins: [allowedOrigin],
    readonlyPort: createFixturePort(calls),
    verifyBearer: async (token) => {
      if (token === validTokenA)
        return { subject: 'user-a', scopes: ['mcp:read'] }
      if (token === validTokenB)
        return { subject: 'user-b', scopes: ['mcp:read'] }
      return undefined
    },
    maxSessions: 4,
  })
}

function createClient(baseUrl: string, token: string) {
  const transport = new StreamableHTTPClientTransport(new URL(baseUrl), {
    requestInit: {
      headers: {
        Authorization: `Bearer ${token}`,
        Origin: allowedOrigin,
      },
    },
    reconnectionOptions: {
      initialReconnectionDelay: 10,
      maxReconnectionDelay: 20,
      reconnectionDelayGrowFactor: 1,
      maxRetries: 0,
    },
  })
  const client = new Client(
    { name: 'mcp-contract-client', version: '1.0.0' },
    { capabilities: {} },
  )
  return { client, transport }
}

function textFromToolResult(result: unknown) {
  if (result === null || typeof result !== 'object') {
    throw new Error('MCP tool returned an invalid result')
  }
  const content = (result as { content?: unknown }).content
  if (!Array.isArray(content)) throw new Error('MCP tool returned no content')
  const first = content[0]
  if (
    first === null ||
    typeof first !== 'object' ||
    !('type' in first) ||
    first.type !== 'text' ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('MCP tool returned non-text content')
  }
  return first.text
}

function textFromResourceResult(result: unknown) {
  if (result === null || typeof result !== 'object') {
    throw new Error('MCP resource returned an invalid result')
  }
  const contents = (result as { contents?: unknown }).contents
  if (!Array.isArray(contents))
    throw new Error('MCP resource returned no contents')
  const first = contents[0]
  if (
    first === null ||
    typeof first !== 'object' ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('MCP resource returned no text')
  }
  return first.text
}

async function closeClient(
  client: Client,
  transport: StreamableHTTPClientTransport,
) {
  await transport.terminateSession()
  await client.close()
}

async function request(
  baseUrl: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(baseUrl, init)
}

function mcpHeaders(
  token = validTokenA,
  overrides: Record<string, string> = {},
) {
  return {
    Authorization: `Bearer ${token}`,
    Origin: allowedOrigin,
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    ...overrides,
  }
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline)
      throw new Error('Timed out waiting for MCP event')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

afterEach(async () => {
  while (openHarnesses.length > 0) {
    const harness = openHarnesses.pop()
    await harness?.close().catch(() => undefined)
  }
})

describe('MCP Streamable HTTP runtime contract', () => {
  it('uses the official in-memory transport for authenticated assistant tool calls', async () => {
    const calls: ReadonlyPortInput[] = []
    const client = await createMcpToolClient(
      { subject: 'assistant-user', scopes: ['mcp:read'] },
      createFixturePort(calls),
    )
    try {
      const tools = await client.listTools()
      expect(tools.map(({ name }) => name)).toContain('get_collection_stats')

      const result = await client.callTool('get_collection_stats', {})
      expect(result.subject).toBe('assistant-user')
      expect(result.operation).toBe('get_collection_stats')
      expect(calls).toContainEqual(
        expect.objectContaining({
          operation: 'get_collection_stats',
          principal: expect.objectContaining({ subject: 'assistant-user' }),
        }),
      )
    } finally {
      await client.close()
    }
  })

  it('uses the official SDK client for stateful POST, GET, tools, resources, concurrency, and DELETE', async () => {
    const calls: ReadonlyPortInput[] = []
    const harness = await startHttpHarness(createFixtureEndpoint(calls))
    const first = createClient(harness.baseUrl, validTokenA)
    const second = createClient(harness.baseUrl, validTokenB)

    await Promise.all([
      first.client.connect(first.transport),
      second.client.connect(second.transport),
    ])
    await waitFor(
      () =>
        harness.requests.filter(({ method }) => method === 'GET').length >= 2,
    )

    expect(first.transport.sessionId).toMatch(/^[a-f0-9-]{36}$/)
    expect(second.transport.sessionId).toMatch(/^[a-f0-9-]{36}$/)
    expect(first.transport.sessionId).not.toBe(second.transport.sessionId)
    expect(
      harness.requests.filter(({ method }) => method === 'POST').length,
    ).toBeGreaterThanOrEqual(2)

    const [firstResult, secondResult] = await Promise.all([
      first.client.callTool({
        name: 'search_pokemon',
        arguments: { query: 'pikachu' },
      }),
      second.client.callTool({
        name: 'search_pokemon',
        arguments: { query: 'eevee' },
      }),
    ])
    expect(JSON.parse(textFromToolResult(firstResult)).subject).toBe('user-a')
    expect(JSON.parse(textFromToolResult(secondResult)).subject).toBe('user-b')

    const resource = await first.client.readResource({
      uri: 'pokedex://pokemon/25',
    })
    expect(resource.contents[0]?.uri).toBe('pokedex://pokemon/25')
    expect(JSON.parse(textFromResourceResult(resource)).subject).toBe('user-a')
    expect(calls.some((call) => call.operation === 'resource_pokemon')).toBe(
      true,
    )

    const listedTools = await first.client.listTools()
    expect(listedTools.tools.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        'search_pokemon',
        'get_pokemon',
        'list_my_collection',
        'get_collection_stats',
        'compare_pokemon',
        'get_research_progress',
      ]),
    )

    const crossUserRequest = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders(validTokenB, {
        'mcp-session-id': first.transport.sessionId ?? '',
        'MCP-Protocol-Version':
          first.transport.protocolVersion ?? LATEST_PROTOCOL_VERSION,
      }),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 4,
        method: 'ping',
        params: {},
      }),
    })
    expect(crossUserRequest.status).toBe(401)

    await closeClient(first.client, first.transport)
    await closeClient(second.client, second.transport)
    expect(
      harness.requests.some(
        ({ method, status }) => method === 'DELETE' && status === 200,
      ),
    ).toBe(true)
    expect(harness.endpoint.getSessionCount()).toBe(0)
  })

  it('rejects authentication, Origin, negotiation, session, and method violations before SDK dispatch', async () => {
    const harness = await startHttpHarness(createFixtureEndpoint())
    const initializeBody = JSON.stringify(jsonRpcInitialize())

    const missingAuth = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders('', { Authorization: '' }),
      body: initializeBody,
    })
    expect(missingAuth.status).toBe(401)
    expect(await missingAuth.text()).not.toContain(validTokenA)

    const invalidAuth = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders('invalid-token'),
      body: initializeBody,
    })
    expect(invalidAuth.status).toBe(401)
    expect(await invalidAuth.text()).not.toContain('invalid-token')

    const forbiddenOrigin = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders(validTokenA, { Origin: 'https://forbidden.example' }),
      body: initializeBody,
    })
    expect(forbiddenOrigin.status).toBe(403)

    const unacceptable = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders(validTokenA, { Accept: 'application/json' }),
      body: initializeBody,
    })
    expect(unacceptable.status).toBe(406)

    const unsupportedVersion = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders(validTokenA, {
        'MCP-Protocol-Version': '2099-01-01',
      }),
      body: initializeBody,
    })
    expect(unsupportedVersion.status).toBe(400)

    const malformed = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders(),
      body: '{not-json',
    })
    expect(malformed.status).toBe(400)

    const noSession = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'ping',
        params: {},
      }),
    })
    expect(noSession.status).toBe(400)

    const invalidSession = await request(harness.baseUrl, {
      method: 'POST',
      headers: mcpHeaders(validTokenA, {
        'mcp-session-id': 'session-secret-in-error',
      }),
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 3,
        method: 'ping',
        params: {},
      }),
    })
    expect(invalidSession.status).toBe(400)
    expect(await invalidSession.text()).not.toContain('session-secret-in-error')

    const unsupportedMethod = await request(harness.baseUrl, {
      method: 'PUT',
      headers: mcpHeaders(),
    })
    expect(unsupportedMethod.status).toBe(405)
    expect(unsupportedMethod.headers.get('allow')).toBe('GET, POST, DELETE')
  })

  it('uses only a bounded, injectable read-only boundary and no legacy Better Auth MCP plugin', () => {
    const mcpSource = [
      'mcp.ts',
      'mcp/client.ts',
      'mcp/contracts.ts',
      'mcp/endpoint.ts',
      'mcp/http.ts',
      'mcp/product-port.ts',
      'mcp/surface.ts',
    ]
      .map((path) =>
        readFileSync(
          new URL(`../../src/server/integrations/${path}`, import.meta.url),
          'utf8',
        ),
      )
      .join('\n')
    const routeSource = readFileSync(
      new URL('../../src/routes/api/mcp.ts', import.meta.url),
      'utf8',
    )
    const assistantSource = readFileSync(
      new URL('../../src/server/assistant.ts', import.meta.url),
      'utf8',
    )
    const betterAuthSource = readFileSync(
      new URL('../../src/server/integrations/better-auth.ts', import.meta.url),
      'utf8',
    )
    const serverSources = `${mcpSource}\n${routeSource}`

    expect(serverSources).not.toMatch(/mongodb|MongoClient|mongo-client/i)
    expect(serverSources).not.toMatch(
      /insertOne|insertMany|updateOne|updateMany|replaceOne|deleteOne|dropDatabase|createCollection/,
    )
    expect(serverSources).not.toMatch(/better-auth\/plugins(?:\/mcp|#mcp)/)
    expect(serverSources).not.toMatch(/\bmcp\s*\(/)
    expect(betterAuthSource).not.toMatch(/\bmcp\s*\(/)
    expect(mcpSource).toContain('readonlyPort')
    expect(mcpSource).toContain('maxSessions')
    expect(assistantSource).toContain('mcp.listTools()')
    expect(assistantSource).toContain('mcp.callTool(')
    expect(assistantSource).not.toMatch(
      /createCatalogService|createCollectionService|createResearchService/,
    )
    expect(SUPPORTED_PROTOCOL_VERSIONS).toContain(LATEST_PROTOCOL_VERSION)
  })
})
