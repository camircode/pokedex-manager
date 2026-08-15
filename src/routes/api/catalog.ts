import { createFileRoute } from '@tanstack/react-router'

import { catalogQuerySchema, getCatalogService } from '@/server/catalog'
import { apiError } from '@/server/http'

export async function catalogHandler(request: Request) {
  try {
    const url = new URL(request.url)
    const input = catalogQuerySchema.parse(Object.fromEntries(url.searchParams))
    return Response.json(await (await getCatalogService()).list(input))
  } catch (error) {
    return apiError(error)
  }
}

export const Route = createFileRoute('/api/catalog')({
  server: { handlers: { GET: ({ request }) => catalogHandler(request) } },
})
