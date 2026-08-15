import { createServerFn } from '@tanstack/react-start'

import { catalogQuerySchema } from '@/lib/catalog-query'
import { getCatalogService } from '@/server/catalog'

export const loadPokemonCatalog = createServerFn({ method: 'GET' })
  .validator((input: unknown) => catalogQuerySchema.parse(input))
  .handler(async ({ data }) => {
    try {
      return await (await getCatalogService()).list(data)
    } catch {
      throw new Error('No se pudo consultar el índice Pokémon.')
    }
  })
