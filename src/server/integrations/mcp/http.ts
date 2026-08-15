import '@tanstack/react-start/server-only'

import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'

import type { McpBearerVerifier } from '@/server/integrations/mcp/contracts'
import { createMcpEndpoint } from '@/server/integrations/mcp/endpoint'
import { productReadonlyPort } from '@/server/integrations/mcp/product-port'

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

const defaultMcpEndpoint = createMcpEndpoint({
  verifyBearer: configuredBearerVerifier(),
  readonlyPort: productReadonlyPort,
})

export function mcpHandler(request: Request) {
  return defaultMcpEndpoint.handle(request)
}
