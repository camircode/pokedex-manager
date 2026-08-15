import '@tanstack/react-start/server-only'

import type { Db, WithId } from 'mongodb'
import { z } from 'zod'

import {
  type CatalogFilterOptions,
  type CatalogQuery,
  catalogQuerySchema,
} from '@/lib/catalog-query'
import { getMongoClient } from '@/server/db/mongo-client'

export { catalogQuerySchema } from '@/lib/catalog-query'

const POKEAPI_URL = 'https://pokeapi.co/api/v2'
const POKEAPI_GRAPHQL_URL = 'https://graphql.pokeapi.co/v1beta2'
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000
const CACHE_SCHEMA_VERSION = 2
const MAX_POKEMON_ID = 1025
const SPANISH_LANGUAGES = ['es', 'es-419'] as const

const namedResourceSchema = z.object({
  name: z.string(),
  url: z.string().url(),
})
const pokemonPayloadSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  height: z.number(),
  weight: z.number(),
  sprites: z.object({
    front_default: z.string().url().nullable(),
    other: z
      .object({
        'official-artwork': z.object({
          front_default: z.string().url().nullable(),
        }),
      })
      .optional(),
  }),
  species: namedResourceSchema,
  types: z.array(z.object({ slot: z.number(), type: namedResourceSchema })),
  stats: z.array(
    z.object({ base_stat: z.number(), stat: namedResourceSchema }),
  ),
  abilities: z.array(
    z.object({ ability: namedResourceSchema, is_hidden: z.boolean() }),
  ),
})
const speciesPayloadSchema = z.object({
  generation: namedResourceSchema,
  genera: z.array(
    z.object({ genus: z.string(), language: z.object({ name: z.string() }) }),
  ),
  names: z
    .array(
      z.object({ name: z.string(), language: z.object({ name: z.string() }) }),
    )
    .default([]),
  flavor_text_entries: z
    .array(
      z.object({
        flavor_text: z.string(),
        language: z.object({ name: z.string() }),
      }),
    )
    .default([]),
})
const listPayloadSchema = z.object({
  count: z.number().int().nonnegative(),
  results: z.array(namedResourceSchema),
})
const typePayloadSchema = z.object({
  pokemon: z.array(z.object({ pokemon: namedResourceSchema })),
})
const generationPayloadSchema = z.object({
  pokemon_species: z.array(namedResourceSchema),
})
const abilityPayloadSchema = z.object({
  name: z.string(),
  names: z.array(
    z.object({ name: z.string(), language: z.object({ name: z.string() }) }),
  ),
  flavor_text_entries: z.array(
    z.object({
      flavor_text: z.string(),
      language: z.object({ name: z.string() }),
    }),
  ),
})
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
export const pokemonIdentifierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[1-9]\d{0,3}|[a-z0-9]+(?:-[a-z0-9]+)*)$/)

export type PokemonRecord = {
  cacheVersion?: number
  pokemonId: number
  name: string
  nameNormalized: string
  displayName?: string
  types: string[]
  stats: Array<{ name: string; value: number }>
  abilities: Array<{
    name: string
    hidden: boolean
    displayName?: string
    description?: string | null
  }>
  sprite: string | null
  species: string
  genus: string | null
  description?: string | null
  generation: string
  height: number
  weight: number
  sourceUpdatedAt: Date
  freshUntil: Date
}

export type PokemonDetailRecord = Omit<PokemonRecord, 'abilities'> & {
  abilities: Array<{
    name: string
    hidden: boolean
    displayName: string
    description: string | null
  }>
}

function cleanPokemon(record: WithId<PokemonRecord>): PokemonRecord {
  const { _id: _ignored, ...pokemon } = record
  return pokemon
}

type FetchLike = typeof fetch
type CatalogCandidate = { id: number; name: string }
type CachedCandidates = { expiresAt: number; items: CatalogCandidate[] }

let filterOptionsCache:
  | { expiresAt: number; items: CatalogFilterOptions }
  | undefined
const statCandidatesCache = new Map<string, CachedCandidates>()

export class CatalogError extends Error {
  readonly status: number

  constructor(message = 'No se pudo consultar PokéAPI.', status = 502) {
    super(message)
    this.name = 'CatalogError'
    this.status = status
  }
}

async function fetchJson(url: string, fetcher: FetchLike) {
  const signal = AbortSignal.timeout(5_000)
  let response: Response
  try {
    response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch {
    throw new CatalogError()
  }
  if (response.status === 404)
    throw new CatalogError('Pokémon no encontrado.', 404)
  if (!response.ok) throw new CatalogError()
  try {
    return (await response.json()) as unknown
  } catch {
    throw new CatalogError()
  }
}

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

function localizedValue<T extends { language: { name: string } }>(
  entries: T[],
  value: (entry: T) => string,
) {
  for (const language of SPANISH_LANGUAGES) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (entry?.language.name === language) return value(entry)
    }
  }
  return undefined
}

function normalizeFlavorText(value: string) {
  return value
    .replace(/[\n\f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function displayIdentifier(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function resourceCandidate(resource: z.infer<typeof namedResourceSchema>) {
  const id = Number(
    resource.url.match(/\/(?:pokemon|pokemon-species)\/(\d+)\/?$/)?.[1],
  )
  if (!Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) return undefined
  return { id, name: resource.name }
}

function trustedSpeciesUrl(resource: z.infer<typeof namedResourceSchema>) {
  const id = Number(resource.url.match(/\/pokemon-species\/(\d+)\/?$/)?.[1])
  if (!Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) {
    throw new CatalogError()
  }
  return `${POKEAPI_URL}/pokemon-species/${id}`
}

function trustedAbilityUrl(name: string) {
  const parsed = pokemonIdentifierSchema.parse(name)
  return `${POKEAPI_URL}/ability/${encodeURIComponent(parsed)}`
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

function sortCandidates(
  candidates: CatalogCandidate[],
  sort: CatalogQuery['sort'],
) {
  const direction = sort.endsWith('desc') ? -1 : 1
  const byName = sort.startsWith('name')
  return candidates.sort((left, right) => {
    const order = byName
      ? left.name < right.name
        ? -1
        : left.name > right.name
          ? 1
          : left.id - right.id
      : left.id - right.id
    return order * direction
  })
}

export function normalizePokemon(
  pokemonInput: unknown,
  speciesInput: unknown,
  now = new Date(),
): PokemonRecord {
  const pokemon = pokemonPayloadSchema.parse(pokemonInput)
  const species = speciesPayloadSchema.parse(speciesInput)
  const displayName =
    localizedValue(species.names, (entry) => entry.name) ??
    displayIdentifier(pokemon.name)
  const description = localizedValue(species.flavor_text_entries, (entry) =>
    normalizeFlavorText(entry.flavor_text),
  )
  return {
    cacheVersion: CACHE_SCHEMA_VERSION,
    pokemonId: pokemon.id,
    name: pokemon.name,
    nameNormalized: pokemon.name.toLowerCase(),
    displayName,
    types: pokemon.types
      .sort((left, right) => left.slot - right.slot)
      .map((entry) => entry.type.name),
    stats: pokemon.stats.map((entry) => ({
      name: entry.stat.name,
      value: entry.base_stat,
    })),
    abilities: pokemon.abilities.map((entry) => ({
      name: entry.ability.name,
      hidden: entry.is_hidden,
    })),
    sprite:
      pokemon.sprites.other?.['official-artwork'].front_default ??
      pokemon.sprites.front_default,
    species: pokemon.species.name,
    genus:
      localizedValue(species.genera, (entry) => entry.genus) ??
      species.genera.find((entry) => entry.language.name === 'en')?.genus ??
      null,
    description: description ?? null,
    generation: species.generation.name,
    height: pokemon.height,
    weight: pokemon.weight,
    sourceUpdatedAt: now,
    freshUntil: new Date(now.getTime() + CACHE_TTL_MS),
  }
}

export function createCatalogService(options: {
  database: Db
  fetch?: FetchLike
  now?: () => Date
}) {
  const collection = options.database.collection<PokemonRecord>('pokemon_cache')
  const fetcher = options.fetch ?? fetch
  const now = options.now ?? (() => new Date())

  async function getPokemon(identifier: string | number) {
    const normalized = pokemonIdentifierSchema.parse(String(identifier))
    const numericId = /^\d+$/.test(normalized) ? Number(normalized) : undefined
    const cacheFilter = numericId
      ? { pokemonId: numericId }
      : { nameNormalized: normalized }
    const cached = await collection.findOne(cacheFilter)
    if (
      cached !== null &&
      cached.cacheVersion === CACHE_SCHEMA_VERSION &&
      cached.freshUntil.getTime() > now().getTime()
    ) {
      return cleanPokemon(cached)
    }

    try {
      const pokemonPayload = await fetchJson(
        `${POKEAPI_URL}/pokemon/${encodeURIComponent(normalized)}`,
        fetcher,
      )
      const parsedPokemon = pokemonPayloadSchema.parse(pokemonPayload)
      const speciesPayload = await fetchJson(
        trustedSpeciesUrl(parsedPokemon.species),
        fetcher,
      )
      const record = normalizePokemon(pokemonPayload, speciesPayload, now())
      await collection.updateOne(
        { pokemonId: record.pokemonId },
        { $set: record },
        { upsert: true },
      )
      return record
    } catch (error) {
      if (cached !== null) return cleanPokemon(cached)
      if (error instanceof CatalogError) throw error
      throw new CatalogError()
    }
  }

  async function getPokemonDetail(
    identifier: string | number,
  ): Promise<PokemonDetailRecord> {
    const pokemon = await getPokemon(identifier)
    if (
      pokemon.abilities.every(
        (ability) =>
          ability.displayName !== undefined &&
          ability.description !== undefined,
      )
    ) {
      return pokemon as PokemonDetailRecord
    }

    try {
      const abilities = await Promise.all(
        pokemon.abilities.map(async (ability) => {
          const payload = abilityPayloadSchema.parse(
            await fetchJson(trustedAbilityUrl(ability.name), fetcher),
          )
          return {
            name: ability.name,
            hidden: ability.hidden,
            displayName:
              localizedValue(payload.names, (entry) => entry.name) ??
              displayIdentifier(ability.name),
            description:
              localizedValue(payload.flavor_text_entries, (entry) =>
                normalizeFlavorText(entry.flavor_text),
              ) ?? null,
          }
        }),
      )
      await collection.updateOne(
        { pokemonId: pokemon.pokemonId },
        { $set: { abilities } },
      )
      return { ...pokemon, abilities }
    } catch {
      return {
        ...pokemon,
        abilities: pokemon.abilities.map((ability) => ({
          name: ability.name,
          hidden: ability.hidden,
          displayName: ability.displayName ?? displayIdentifier(ability.name),
          description: ability.description ?? null,
        })),
      }
    }
  }

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

  async function listGraphqlCandidates(query: CatalogQuery) {
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
    const cached = statCandidatesCache.get(cacheKey)
    const timestamp = now().getTime()
    if (cached !== undefined && cached.expiresAt > timestamp) {
      return cached.items
    }

    const pokemonFilters: Record<string, unknown>[] = [
      { id: { _lte: MAX_POKEMON_ID } },
      { is_default: { _eq: true } },
    ]
    if (query.type !== '') {
      pokemonFilters.push({
        pokemontypes: { type: { name: { _eq: query.type } } },
      })
    }
    if (query.generation !== '') {
      pokemonFilters.push({
        pokemonspecy: { generation: { name: { _eq: query.generation } } },
      })
    }
    if (query.ability !== '') {
      pokemonFilters.push({
        pokemonabilities: { ability: { name: { _eq: query.ability } } },
      })
    }
    if (query.category !== '') {
      pokemonFilters.push({
        pokemonspecy: {
          pokemonspeciesnames: {
            language: { name: { _eq: 'es' } },
            genus: { _eq: query.category },
          },
        },
      })
    }
    if (query.query !== '') {
      pokemonFilters.push(
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
                { where: { _and: pokemonFilters } },
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
                    pokemon: { _and: pokemonFilters },
                  },
                },
                fetcher,
              ),
            )
            .data.rows.map(({ pokemon }) => ({
              id: pokemon.id,
              name: pokemon.name,
            }))
    if (statCandidatesCache.size >= 50) {
      const oldestKey = statCandidatesCache.keys().next().value
      if (oldestKey !== undefined) statCandidatesCache.delete(oldestKey)
    }
    statCandidatesCache.set(cacheKey, {
      expiresAt: timestamp + CACHE_TTL_MS,
      items,
    })
    return items
  }

  async function list(input: unknown) {
    const query = catalogQuerySchema.parse(input)
    const offset = (query.page - 1) * query.limit
    const graphqlCandidates = await listGraphqlCandidates(query)
    if (graphqlCandidates !== undefined) {
      const selected = graphqlCandidates.slice(offset, offset + query.limit)
      return {
        items: await Promise.all(selected.map((entry) => getPokemon(entry.id))),
        page: query.page,
        pages: Math.max(1, Math.ceil(graphqlCandidates.length / query.limit)),
        total: graphqlCandidates.length,
      }
    }
    const hasFilters =
      query.type !== '' || query.generation !== '' || query.ability !== ''

    if (!hasFilters && /^\d+$/.test(query.query)) {
      const numericId = Number(query.query)
      if (numericId > MAX_POKEMON_ID)
        return { items: [], page: 1, pages: 1, total: 0 }
      const item = await getPokemon(query.query)
      return { items: [item], page: 1, pages: 1, total: 1 }
    }

    if (!hasFilters && query.query === '' && query.sort === 'id-asc') {
      const payload = listPayloadSchema.parse(
        await fetchJson(
          `${POKEAPI_URL}/pokemon?offset=${offset}&limit=${query.limit}`,
          fetcher,
        ),
      )
      const items = await Promise.all(
        payload.results.map((entry) => getPokemon(entry.name)),
      )
      return {
        items,
        page: query.page,
        pages: Math.ceil(Math.min(payload.count, MAX_POKEMON_ID) / query.limit),
        total: Math.min(payload.count, MAX_POKEMON_ID),
      }
    }

    const [typeInput, generationInput, abilityInput] = await Promise.all([
      query.type === ''
        ? undefined
        : fetchJson(
            `${POKEAPI_URL}/type/${encodeURIComponent(query.type)}`,
            fetcher,
          ),
      query.generation === ''
        ? undefined
        : fetchJson(
            `${POKEAPI_URL}/generation/${encodeURIComponent(query.generation)}`,
            fetcher,
          ),
      query.ability === ''
        ? undefined
        : fetchJson(
            `${POKEAPI_URL}/ability/${encodeURIComponent(query.ability)}`,
            fetcher,
          ),
    ])

    const candidateSets = [
      typeInput === undefined
        ? undefined
        : typePayloadSchema
            .parse(typeInput)
            .pokemon.map((entry) => resourceCandidate(entry.pokemon))
            .filter((entry): entry is CatalogCandidate => entry !== undefined),
      generationInput === undefined
        ? undefined
        : generationPayloadSchema
            .parse(generationInput)
            .pokemon_species.map(resourceCandidate)
            .filter((entry): entry is CatalogCandidate => entry !== undefined),
      abilityInput === undefined
        ? undefined
        : typePayloadSchema
            .parse(abilityInput)
            .pokemon.map((entry) => resourceCandidate(entry.pokemon))
            .filter((entry): entry is CatalogCandidate => entry !== undefined),
    ].filter((set): set is CatalogCandidate[] => set !== undefined)

    let candidates = candidateSets[0]
    if (candidates === undefined) {
      candidates = listPayloadSchema
        .parse(
          await fetchJson(
            `${POKEAPI_URL}/pokemon?offset=0&limit=${MAX_POKEMON_ID}`,
            fetcher,
          ),
        )
        .results.map(resourceCandidate)
        .filter((entry): entry is CatalogCandidate => entry !== undefined)
    } else {
      for (const set of candidateSets.slice(1)) {
        const ids = new Set(set.map((entry) => entry.id))
        candidates = candidates.filter((entry) => ids.has(entry.id))
      }
    }

    const unique = [
      ...new Map(candidates.map((entry) => [entry.name, entry])).values(),
    ]
    const matches = sortCandidates(
      unique.filter((entry) =>
        /^\d+$/.test(query.query)
          ? entry.id === Number(query.query)
          : entry.name.includes(query.query),
      ),
      query.sort,
    )
    const selected = matches.slice(offset, offset + query.limit)
    const items = await Promise.all(
      selected.map((entry) => getPokemon(entry.id)),
    )
    return {
      items,
      page: query.page,
      pages: Math.max(1, Math.ceil(matches.length / query.limit)),
      total: matches.length,
    }
  }

  return { getPokemon, getPokemonDetail, list, listFilterOptions }
}

export async function getCatalogService() {
  return createCatalogService({ database: await getMongoClient().connect() })
}
