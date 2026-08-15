import { createFileRoute } from '@tanstack/react-router'

import { requireUser } from '@/server/auth'
import { apiError } from '@/server/http'
import { loadKimiConfig } from '@/server/integrations/kimi'
import { getMcpHttpCapability } from '@/server/integrations/mcp'

export async function capabilitiesHandler(request: Request) {
  try {
    await requireUser(request.headers)
    const kimi = loadKimiConfig()
    return Response.json(
      {
        kimi: kimi.enabled && kimi.apiKey !== undefined,
        mcp: getMcpHttpCapability(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const response = apiError(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const Route = createFileRoute('/api/capabilities')({
  server: { handlers: { GET: ({ request }) => capabilitiesHandler(request) } },
})
