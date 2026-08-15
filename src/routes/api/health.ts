import { createFileRoute } from '@tanstack/react-router'

import { getMongoClient, type MongoClientPort } from '@/server/db/mongo-client'

export async function healthHandler(client?: MongoClientPort) {
  try {
    const health = await (client ?? getMongoClient()).health()
    const statusCode = health.status === 'healthy' ? 200 : 503

    return Response.json(
      { status: health.status },
      {
        status: statusCode,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  } catch {
    return Response.json(
      { status: 'unhealthy' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    )
  }
}

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: () => healthHandler(),
    },
  },
})
