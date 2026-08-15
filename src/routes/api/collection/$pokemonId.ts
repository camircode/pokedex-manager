import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { requireUser } from '@/server/auth'
import { getCollectionService } from '@/server/collection'
import { apiError, assertTrustedMutation, readJsonBody } from '@/server/http'

export async function collectionEntryHandler(
  request: Request,
  pokemonIdInput: string,
) {
  try {
    const user = await requireUser(request.headers)
    const pokemonId = z.coerce
      .number()
      .int()
      .min(1)
      .max(1025)
      .parse(pokemonIdInput)
    assertTrustedMutation(request)
    const service = await getCollectionService()
    if (request.method === 'DELETE') {
      await service.remove(user.id, pokemonId)
      return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    return Response.json(
      await service.update(user.id, pokemonId, await readJsonBody(request)),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    const response = apiError(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const Route = createFileRoute('/api/collection/$pokemonId')({
  server: {
    handlers: {
      PATCH: ({ request, params }) =>
        collectionEntryHandler(request, params.pokemonId),
      DELETE: ({ request, params }) =>
        collectionEntryHandler(request, params.pokemonId),
    },
  },
})
