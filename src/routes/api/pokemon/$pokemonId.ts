import { createFileRoute } from '@tanstack/react-router'

import { getCatalogService, pokemonIdentifierSchema } from '@/server/catalog'
import { apiError } from '@/server/http'

export async function pokemonHandler(pokemonId: string) {
  try {
    return Response.json(
      await (await getCatalogService()).getPokemon(
        pokemonIdentifierSchema.parse(pokemonId),
      ),
    )
  } catch (error) {
    return apiError(error)
  }
}

export const Route = createFileRoute('/api/pokemon/$pokemonId')({
  server: {
    handlers: { GET: ({ params }) => pokemonHandler(params.pokemonId) },
  },
})
