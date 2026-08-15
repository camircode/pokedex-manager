import { createFileRoute } from '@tanstack/react-router'

import { apiError, withLimitedBody } from '@/server/http'
import { mcpHandler } from '@/server/integrations/mcp'

const MAX_MCP_BODY_BYTES = 1024 * 1024

async function boundedMcpHandler(request: Request) {
  try {
    const bounded =
      request.method === 'POST'
        ? await withLimitedBody(request, MAX_MCP_BODY_BYTES)
        : request
    return mcpHandler(bounded)
  } catch (error) {
    return apiError(error)
  }
}

export const Route = createFileRoute('/api/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => boundedMcpHandler(request),
      POST: ({ request }) => boundedMcpHandler(request),
      DELETE: ({ request }) => boundedMcpHandler(request),
    },
  },
})
