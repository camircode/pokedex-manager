import { type Db, MongoClient } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  createCatalogService,
  normalizePokemon,
  type PokemonRecord,
} from '../../src/server/catalog'
import {
  type CollectionEntry,
  createCollectionService,
} from '../../src/server/collection'
import { createResearchService } from '../../src/server/research'

const mongoUri =
  process.env.MONGO_TEST_URI ??
  'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=2_000'
const databaseName = `pokedex_mvp_${process.pid}_${Date.now()}`
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2_000 })
let database: Db

const pokemonPayload = {
  id: 25,
  name: 'pikachu',
  height: 4,
  weight: 60,
  sprites: {
    front_default: 'https://img.example.test/pikachu.png',
    other: {
      'official-artwork': {
        front_default: 'https://img.example.test/pikachu-art.png',
      },
    },
  },
  species: {
    name: 'pikachu',
    url: 'https://pokeapi.co/api/v2/pokemon-species/25/',
  },
  types: [
    {
      slot: 1,
      type: { name: 'electric', url: 'https://pokeapi.co/api/v2/type/13/' },
    },
  ],
  stats: [
    {
      base_stat: 90,
      stat: { name: 'speed', url: 'https://pokeapi.co/api/v2/stat/6/' },
    },
  ],
  abilities: [
    {
      ability: {
        name: 'static',
        url: 'https://pokeapi.co/api/v2/ability/9/',
      },
      is_hidden: false,
    },
  ],
}
const speciesPayload = {
  generation: {
    name: 'generation-i',
    url: 'https://pokeapi.co/api/v2/generation/1/',
  },
  genera: [
    { genus: 'Mouse Pokémon', language: { name: 'en' } },
    { genus: 'Pokémon Ratón', language: { name: 'es' } },
  ],
  names: [{ name: 'Pikachu', language: { name: 'es' } }],
  flavor_text_entries: [
    {
      flavor_text: 'Almacena electricidad en las bolsas de sus mejillas.',
      language: { name: 'es' },
    },
  ],
}

function pokemonRecord(): PokemonRecord {
  return normalizePokemon(
    pokemonPayload,
    speciesPayload,
    new Date('2026-01-01'),
  )
}

function collectionEntry(userId: string): CollectionEntry {
  return {
    userId,
    pokemonId: 25,
    pokemon: {
      name: 'pikachu',
      sprite: null,
      types: ['electric'],
      generation: 'generation-i',
    },
    quantity: 1,
    nickname: null,
    notes: '',
    tags: [],
    favorite: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

beforeAll(async () => {
  await client.connect()
  database = client.db(databaseName)
  await database
    .collection('collection_entries')
    .createIndex(
      { userId: 1, pokemonId: 1 },
      { unique: true, name: 'test_user_pokemon_unique' },
    )
  await database.collection('research_expeditions').createIndex(
    { userId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: 'active' },
      name: 'test_active_user_unique',
    },
  )
})

afterAll(async () => {
  await database.collection('pokemon_cache').deleteMany({})
  await database.collection('collection_entries').deleteMany({})
  await database.collection('research_expeditions').deleteMany({})
  await client.close()
})

describe('PokéAPI normalization and stale fallback', () => {
  it('normaliza el detalle, cachea y usa el registro vencido si PokéAPI falla', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      return Response.json(
        url.includes('pokemon-species') ? speciesPayload : pokemonPayload,
      )
    })
    const service = createCatalogService({
      database,
      fetch: fetcher,
      now: () => new Date('2026-01-01T00:00:00Z'),
    })
    const first = await service.getPokemon(25)
    expect(first).toMatchObject({
      pokemonId: 25,
      name: 'pikachu',
      displayName: 'Pikachu',
      types: ['electric'],
      genus: 'Pokémon Ratón',
      description: 'Almacena electricidad en las bolsas de sus mejillas.',
      generation: 'generation-i',
      catalogSprite: 'https://img.example.test/pikachu.png',
      sprite: 'https://img.example.test/pikachu-art.png',
    })
    expect(fetcher).toHaveBeenCalledTimes(2)

    const fallback = createCatalogService({
      database,
      fetch: vi.fn(async () => {
        throw new Error('provider unavailable')
      }),
      now: () => new Date('2026-01-03T00:00:00Z'),
    })
    await expect(fallback.getPokemon(25)).resolves.toMatchObject({
      pokemonId: 25,
      name: 'pikachu',
    })
    expect(await fallback.getPokemon(25)).not.toHaveProperty('_id')
  })
})

describe('collection ownership and atomic add', () => {
  it('incrementa concurrentemente una sola entrada y nunca cruza usuarios', async () => {
    const service = createCollectionService(database)
    await Promise.all([
      service.add('owner-a', pokemonRecord(), { pokemonId: 25, quantity: 1 }),
      service.add('owner-a', pokemonRecord(), { pokemonId: 25, quantity: 2 }),
    ])
    expect(await service.list('owner-a')).toMatchObject([
      { userId: 'owner-a', pokemonId: 25, quantity: 3 },
    ])
    expect(await service.list('owner-b')).toEqual([])
    await expect(
      service.update('owner-b', 25, { favorite: true }),
    ).rejects.toMatchObject({ status: 404 })
    await service.update('owner-a', 25, { quantity: 999 })
    await expect(
      service.add('owner-a', pokemonRecord(), { pokemonId: 25, quantity: 1 }),
    ).rejects.toMatchObject({
      status: 400,
      message: 'La cantidad total no puede superar 999.',
    })
  })
})

describe('research expedition idempotency', () => {
  it('mantiene investigación vacía hasta una generación explícita', async () => {
    const service = createResearchService(database)
    const entries = [collectionEntry('research-user')]
    const [first, second] = await Promise.all([
      service.current('research-user', entries),
      service.current('research-user', entries),
    ])
    expect(first).toBeNull()
    expect(second).toBeNull()
    expect(
      await database
        .collection('research_expeditions')
        .countDocuments({ userId: 'research-user', status: 'active' }),
    ).toBe(0)
  })
})
