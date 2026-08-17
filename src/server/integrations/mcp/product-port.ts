import '@tanstack/react-start/server-only'

import { getCatalogService } from '@/server/catalog'
import { getCollectionService } from '@/server/collection'
import type { ReadonlyToolPort } from '@/server/integrations/mcp/contracts'
import { getCurrentResearch } from '@/server/research'

export const productReadonlyPort: ReadonlyToolPort = {
  async list({ principal, operation, input }) {
    const catalog = await getCatalogService()
    const collection = await getCollectionService()
    let data: unknown
    switch (operation) {
      case 'search_pokemon': {
        const requestedLimit =
          typeof input.limit === 'number' ? input.limit : 20
        const result = await catalog.list({
          query: input.query ?? '',
          type: input.type ?? '',
          generation: input.generation ?? '',
          ability: input.ability ?? '',
          category: input.category ?? '',
          sort: input.sort ?? 'id-asc',
          limit: Math.max(requestedLimit, 5),
          page: 1,
        })
        data = {
          ...result,
          items: result.items.slice(0, requestedLimit),
        }
        break
      }
      case 'get_pokemon':
      case 'resource_pokemon':
        data = await catalog.getPokemon(String(input.pokemonId))
        break
      case 'list_my_collection':
        data = (await collection.list(principal.subject)).slice(
          0,
          typeof input.limit === 'number' ? input.limit : 20,
        )
        break
      case 'resource_collection':
        data = await collection.list(principal.subject)
        break
      case 'get_collection_stats':
      case 'resource_collection_stats':
        data = await collection.stats(principal.subject)
        break
      case 'get_research_progress':
      case 'resource_research_active':
        data = await getCurrentResearch(principal.subject)
        break
      case 'compare_pokemon':
        data = await Promise.all([
          catalog.getPokemon(String(input.leftId)),
          catalog.getPokemon(String(input.rightId)),
        ])
        break
    }
    return { operation, subject: principal.subject, data }
  },
}
