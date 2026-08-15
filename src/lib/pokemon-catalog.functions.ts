import { createServerFn } from '@tanstack/react-start'

import { catalogQuerySchema } from '@/lib/catalog-query'
import { getCatalogService } from '@/server/catalog'

export const loadPokemonCatalog = createServerFn({ method: 'GET' })
  .validator((input: unknown) => catalogQuerySchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const service = await getCatalogService()
      const [catalog, filterOptions] = await Promise.all([
        service.list(data),
        service.listFilterOptions(),
      ])
      return { ...catalog, filterOptions }
    } catch {
      throw new Error('No se pudo consultar el índice Pokémon.')
    }
  })
