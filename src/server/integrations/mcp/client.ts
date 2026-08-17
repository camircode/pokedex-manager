import '@tanstack/react-start/server-only'

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import {
  McpClientError,
  type McpPrincipal,
  type McpToolName,
  type ReadonlyResult,
  type ReadonlyToolPort,
} from '@/server/integrations/mcp/contracts'
import { productReadonlyPort } from '@/server/integrations/mcp/product-port'
import { createSessionServer } from '@/server/integrations/mcp/surface'

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
    { name: 'pokedex-manager-server', version: '0.1.0' },
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
