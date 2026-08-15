import { createFileRoute } from '@tanstack/react-router'

import { requireUser } from '@/server/auth'
import {
  addPokemonToCollection,
  getCollectionService,
} from '@/server/collection'
import { apiError, assertTrustedMutation, readJsonBody } from '@/server/http'

export async function collectionHandler(request: Request) {
  try {
    const user = await requireUser(request.headers)
    if (request.method === 'POST') {
      assertTrustedMutation(request)
      return Response.json(
        await addPokemonToCollection(user.id, await readJsonBody(request)),
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return Response.json(await (await getCollectionService()).list(user.id), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    const response = apiError(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const Route = createFileRoute('/api/collection')({
  server: {
    handlers: {
      GET: ({ request }) => collectionHandler(request),
      POST: ({ request }) => collectionHandler(request),
    },
  },
})
