import { createFileRoute } from '@tanstack/react-router'

import { requireUser } from '@/server/auth'
import { getCollectionService } from '@/server/collection'
import { apiError } from '@/server/http'

export async function statsHandler(request: Request) {
  try {
    const user = await requireUser(request.headers)
    return Response.json(await (await getCollectionService()).stats(user.id), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const response = apiError(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const Route = createFileRoute('/api/stats')({
  server: { handlers: { GET: ({ request }) => statsHandler(request) } },
})
