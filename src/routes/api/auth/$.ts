import { createFileRoute } from '@tanstack/react-router'

import { getAuth } from '@/server/auth'
import { apiError, withLimitedBody } from '@/server/http'

const MAX_AUTH_BODY_BYTES = 64 * 1024

export async function authApiHandler(request: Request) {
  try {
    const bounded =
      request.method === 'POST'
        ? await withLimitedBody(request, MAX_AUTH_BODY_BYTES)
        : request
    return (await getAuth()).handler(bounded)
  } catch (error) {
    return apiError(error)
  }
}

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => authApiHandler(request),
      POST: ({ request }) => authApiHandler(request),
    },
  },
})
