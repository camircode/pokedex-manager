import '@tanstack/react-start/server-only'

import type { Db, WithId } from 'mongodb'

import { catalogQuerySchema } from '@/lib/catalog-query'
import { createCatalogGraphqlClient } from '@/server/catalog/graphql'
import {
  CACHE_SCHEMA_VERSION,
  CatalogError,
  displayIdentifier,
  type FetchLike,
  MAX_POKEMON_ID,
  type PokemonDetailRecord,
  type PokemonRecord,
  pokemonIdentifierSchema,
} from '@/server/catalog/model'
import { createPokeApiClient } from '@/server/catalog/pokeapi'
import { getMongoClient } from '@/server/db/mongo-client'

export { catalogQuerySchema } from '@/lib/catalog-query'
export type {
  PokemonDetailRecord,
  PokemonRecord,
} from '@/server/catalog/model'
export {
  CatalogError,
  normalizePokemon,
  pokemonIdentifierSchema,
} from '@/server/catalog/model'

function cleanPokemon(record: WithId<PokemonRecord>): PokemonRecord {
  const { _id: _ignored, ...pokemon } = record
  return pokemon
}

export function createCatalogService(options: {
  database: Db
  fetch?: FetchLike
  now?: () => Date
}) {
  const collection = options.database.collection<PokemonRecord>('pokemon_cache')
  const fetcher = options.fetch ?? fetch
  const now = options.now ?? (() => new Date())
  const pokeapi = createPokeApiClient(fetcher)
  const graphql = createCatalogGraphqlClient(fetcher, now)

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
      const record = await pokeapi.getPokemon(normalized, now())
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
      const detail = await pokeapi.enrichAbilities(pokemon)
      await collection.updateOne(
        { pokemonId: pokemon.pokemonId },
        { $set: { abilities: detail.abilities } },
      )
      return detail
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

  async function list(input: unknown) {
    const query = catalogQuerySchema.parse(input)
    const offset = (query.page - 1) * query.limit
    const graphqlCandidates = await graphql.listCandidates(query)
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
      if (numericId > MAX_POKEMON_ID) {
        return { items: [], page: 1, pages: 1, total: 0 }
      }
      const item = await getPokemon(query.query)
      return { items: [item], page: 1, pages: 1, total: 1 }
    }

    if (!hasFilters && query.query === '' && query.sort === 'id-asc') {
      const payload = await pokeapi.listPage(offset, query.limit)
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

    const candidates = await pokeapi.listCandidates(query)
    const selected = candidates.slice(offset, offset + query.limit)
    return {
      items: await Promise.all(selected.map((entry) => getPokemon(entry.id))),
      page: query.page,
      pages: Math.max(1, Math.ceil(candidates.length / query.limit)),
      total: candidates.length,
    }
  }

  return {
    getPokemon,
    getPokemonDetail,
    list,
    listFilterOptions: graphql.listFilterOptions,
  }
}

export async function getCatalogService() {
  return createCatalogService({ database: await getMongoClient().connect() })
}
