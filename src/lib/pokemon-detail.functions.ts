import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { getCatalogService } from '@/server/catalog'

const pokemonDetailInputSchema = z.object({
  pokemonId: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^(?:[1-9]\d{0,3}|[a-z0-9]+(?:-[a-z0-9]+)*)$/),
})

export const loadPokemonDetail = createServerFn({ method: 'GET' })
  .validator((input: unknown) => {
    const result = pokemonDetailInputSchema.safeParse(input)
    if (!result.success) throw new Error('Identificador de Pokémon inválido.')
    return result.data
  })
  .handler(async ({ data }) => {
    try {
      return await (await getCatalogService()).getPokemon(data.pokemonId)
    } catch (error) {
      const status =
        error instanceof Error && 'status' in error
          ? Number(error.status)
          : undefined
      throw new Error(
        status === 404
          ? 'Pokémon no encontrado.'
          : 'No se pudo cargar la ficha del Pokémon.',
      )
    }
  })
