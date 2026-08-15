import { z } from 'zod'

import type { CatalogFilterOptions, CatalogQuery } from '@/lib/catalog-query'
import {
  CACHE_TTL_MS,
  type CatalogCandidate,
  CatalogError,
  displayIdentifier,
  type FetchLike,
  localizedValue,
  MAX_POKEMON_ID,
  SPANISH_LANGUAGES,
} from '@/server/catalog/model'

const POKEAPI_GRAPHQL_URL = 'https://graphql.pokeapi.co/v1beta2'

const filterOptionsResponseSchema = z.object({
  data: z.object({
    ability: z.array(
      z.object({
        name: z.string(),
        abilitynames: z.array(
          z.object({
            name: z.string(),
            language: z.object({ name: z.string() }),
          }),
        ),
      }),
    ),
    categories: z.array(z.object({ genus: z.string() })),
  }),
})
const statCandidatesResponseSchema = z.object({
  data: z.object({
    rows: z.array(
      z.object({ pokemon: z.object({ id: z.number(), name: z.string() }) }),
    ),
  }),
})
const pokemonCandidatesResponseSchema = z.object({
  data: z.object({
    rows: z.array(z.object({ id: z.number(), name: z.string() })),
  }),
})

type CachedCandidates = { expiresAt: number; items: CatalogCandidate[] }

let filterOptionsCache:
  | { expiresAt: number; items: CatalogFilterOptions }
  | undefined
const candidateCache = new Map<string, CachedCandidates>()

async function fetchGraphql(
  query: string,
  variables: Record<string, unknown>,
  fetcher: FetchLike,
  timeoutMs = 5_000,
) {
  const signal = AbortSignal.timeout(timeoutMs)
  let response: Response
  try {
    response = await fetcher(POKEAPI_GRAPHQL_URL, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
      signal,
    })
  } catch {
    throw new CatalogError()
  }
  if (!response.ok) throw new CatalogError()
  try {
    return (await response.json()) as unknown
  } catch {
    throw new CatalogError()
  }
}

function statSort(sort: CatalogQuery['sort']) {
  const match = sort.match(
    /^(hp|attack|defense|special-attack|special-defense|speed)-(asc|desc)$/,
  )
  if (match === null) return undefined
  return { stat: match[1], direction: match[2] as 'asc' | 'desc' }
}

function graphqlPokemonOrder(sort: CatalogQuery['sort']) {
  switch (sort) {
    case 'id-desc':
      return '[{ id: desc }]'
    case 'name-asc':
      return '[{ name: asc }, { id: asc }]'
    case 'name-desc':
      return '[{ name: desc }, { id: asc }]'
    case 'generation-asc':
      return '[{ pokemonspecy: { generation_id: asc } }, { id: asc }]'
    case 'generation-desc':
      return '[{ pokemonspecy: { generation_id: desc } }, { id: asc }]'
    default:
      return '[{ id: asc }]'
  }
}

function pokemonFilters(query: CatalogQuery) {
  const filters: Record<string, unknown>[] = [
    { id: { _lte: MAX_POKEMON_ID } },
    { is_default: { _eq: true } },
  ]
  if (query.type !== '') {
    filters.push({
      pokemontypes: { type: { name: { _eq: query.type } } },
    })
  }
  if (query.generation !== '') {
    filters.push({
      pokemonspecy: { generation: { name: { _eq: query.generation } } },
    })
  }
  if (query.ability !== '') {
    filters.push({
      pokemonabilities: { ability: { name: { _eq: query.ability } } },
    })
  }
  if (query.category !== '') {
    filters.push({
      pokemonspecy: {
        pokemonspeciesnames: {
          language: { name: { _eq: 'es' } },
          genus: { _eq: query.category },
        },
      },
    })
  }
  if (query.query !== '') {
    filters.push(
      /^\d+$/.test(query.query)
        ? { id: { _eq: Number(query.query) } }
        : {
            _or: [
              { name: { _ilike: `%${query.query}%` } },
              {
                pokemonspecy: {
                  pokemonspeciesnames: {
                    _and: [
                      {
                        language: {
                          name: { _in: [...SPANISH_LANGUAGES] },
                        },
                      },
                      { name: { _ilike: `%${query.query}%` } },
                    ],
                  },
                },
              },
            ],
          },
    )
  }
  return filters
}

export function createCatalogGraphqlClient(
  fetcher: FetchLike,
  now: () => Date,
) {
  async function listFilterOptions() {
    const timestamp = now().getTime()
    if (
      filterOptionsCache !== undefined &&
      filterOptionsCache.expiresAt > timestamp
    ) {
      return filterOptionsCache.items
    }

    try {
      const response = filterOptionsResponseSchema.parse(
        await fetchGraphql(
          `query CatalogFilterOptions {
            ability(
              where: {
                is_main_series: { _eq: true }
                pokemonabilities: {
                  pokemon: { id: { _lte: 1025 }, is_default: { _eq: true } }
                }
              }
              order_by: { id: asc }
              limit: 500
            ) {
              name
              abilitynames(
                where: { language: { name: { _in: ["es", "es-419"] } } }
              ) {
                name
                language { name }
              }
            }
            categories: pokemonspeciesname(
              distinct_on: genus
              where: {
                language: { name: { _eq: "es" } }
                genus: { _neq: "" }
                pokemonspecy: { id: { _lte: 1025 } }
              }
              order_by: { genus: asc }
            ) {
              genus
            }
          }`,
          {},
          fetcher,
          1_500,
        ),
      )
      const items: CatalogFilterOptions = {
        abilities: response.data.ability.map((ability) => ({
          value: ability.name,
          label:
            localizedValue(ability.abilitynames, (entry) => entry.name) ??
            displayIdentifier(ability.name),
        })),
        categories: response.data.categories.map(({ genus }) => ({
          value: genus,
          label: genus.replace(/^Pokémon\s+/u, ''),
        })),
      }
      filterOptionsCache = {
        expiresAt: timestamp + CACHE_TTL_MS,
        items,
      }
      return items
    } catch {
      return filterOptionsCache?.items ?? { abilities: [], categories: [] }
    }
  }

  async function listCandidates(query: CatalogQuery) {
    const parsedSort = statSort(query.sort)
    const needsGraphql =
      parsedSort !== undefined ||
      query.category !== '' ||
      query.sort.startsWith('generation-')
    if (!needsGraphql) return undefined

    const cacheKey = JSON.stringify({
      query: query.query,
      type: query.type,
      generation: query.generation,
      ability: query.ability,
      category: query.category,
      sort: query.sort,
    })
    const cached = candidateCache.get(cacheKey)
    const timestamp = now().getTime()
    if (cached !== undefined && cached.expiresAt > timestamp) {
      return cached.items
    }

    const filters = pokemonFilters(query)
    const items =
      parsedSort === undefined
        ? pokemonCandidatesResponseSchema
            .parse(
              await fetchGraphql(
                `query CatalogCandidates($where: pokemon_bool_exp!) {
                  rows: pokemon(
                    where: $where
                    order_by: ${graphqlPokemonOrder(query.sort)}
                    limit: ${MAX_POKEMON_ID}
                  ) {
                    id
                    name
                  }
                }`,
                { where: { _and: filters } },
                fetcher,
              ),
            )
            .data.rows.map((pokemon) => ({
              id: pokemon.id,
              name: pokemon.name,
            }))
        : statCandidatesResponseSchema
            .parse(
              await fetchGraphql(
                `query CatalogByStat($where: pokemonstat_bool_exp!) {
                  rows: pokemonstat(
                    where: $where
                    order_by: [{ base_stat: ${parsedSort.direction} }, { pokemon_id: asc }]
                    limit: ${MAX_POKEMON_ID}
                  ) {
                    pokemon { id name }
                  }
                }`,
                {
                  where: {
                    stat: { name: { _eq: parsedSort.stat } },
                    pokemon: { _and: filters },
                  },
                },
                fetcher,
              ),
            )
            .data.rows.map(({ pokemon }) => ({
              id: pokemon.id,
              name: pokemon.name,
            }))

    if (candidateCache.size >= 50) {
      const oldestKey = candidateCache.keys().next().value
      if (oldestKey !== undefined) candidateCache.delete(oldestKey)
    }
    candidateCache.set(cacheKey, {
      expiresAt: timestamp + CACHE_TTL_MS,
      items,
    })
    return items
  }

  return { listCandidates, listFilterOptions }
}
