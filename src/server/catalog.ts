import '@tanstack/react-start/server-only'

import type { Db, WithId } from 'mongodb'
import { z } from 'zod'

import { type CatalogQuery, catalogQuerySchema } from '@/lib/catalog-query'
import { getMongoClient } from '@/server/db/mongo-client'

export { catalogQuerySchema } from '@/lib/catalog-query'

const POKEAPI_URL = 'https://pokeapi.co/api/v2'
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000
const MAX_POKEMON_ID = 1025

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
export const pokemonIdentifierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[1-9]\d{0,3}|[a-z0-9]+(?:-[a-z0-9]+)*)$/)

export type PokemonRecord = {
  pokemonId: number
  name: string
  nameNormalized: string
  types: string[]
  stats: Array<{ name: string; value: number }>
  abilities: Array<{ name: string; hidden: boolean }>
  sprite: string | null
  species: string
  genus: string | null
  generation: string
  height: number
  weight: number
  sourceUpdatedAt: Date
  freshUntil: Date
}

function cleanPokemon(record: WithId<PokemonRecord>): PokemonRecord {
  const { _id: _ignored, ...pokemon } = record
  return pokemon
}

type FetchLike = typeof fetch
type CatalogCandidate = { id: number; name: string }

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
  return {
    pokemonId: pokemon.id,
    name: pokemon.name,
    nameNormalized: pokemon.name.toLowerCase(),
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
      species.genera.find((entry) => entry.language.name === 'en')?.genus ??
      null,
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
    if (cached !== null && cached.freshUntil.getTime() > now().getTime()) {
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

  async function list(input: unknown) {
    const query = catalogQuerySchema.parse(input)
    const offset = (query.page - 1) * query.limit
    const hasFilters = query.type !== '' || query.generation !== ''

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

    const [typeInput, generationInput] = await Promise.all([
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
    ])

    let candidates: CatalogCandidate[]
    if (typeInput !== undefined) {
      candidates = typePayloadSchema
        .parse(typeInput)
        .pokemon.map((entry) => resourceCandidate(entry.pokemon))
        .filter((entry): entry is CatalogCandidate => entry !== undefined)
    } else if (generationInput !== undefined) {
      candidates = generationPayloadSchema
        .parse(generationInput)
        .pokemon_species.map(resourceCandidate)
        .filter((entry): entry is CatalogCandidate => entry !== undefined)
    } else {
      candidates = listPayloadSchema
        .parse(
          await fetchJson(
            `${POKEAPI_URL}/pokemon?offset=0&limit=${MAX_POKEMON_ID}`,
            fetcher,
          ),
        )
        .results.map(resourceCandidate)
        .filter((entry): entry is CatalogCandidate => entry !== undefined)
    }

    if (generationInput !== undefined && typeInput !== undefined) {
      const generationIds = new Set(
        generationPayloadSchema
          .parse(generationInput)
          .pokemon_species.map(resourceCandidate)
          .filter((entry): entry is CatalogCandidate => entry !== undefined)
          .map((entry) => entry.id),
      )
      candidates = candidates.filter((entry) => generationIds.has(entry.id))
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

  return { getPokemon, list }
}

export async function getCatalogService() {
  return createCatalogService({ database: await getMongoClient().connect() })
}
