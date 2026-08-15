import type { Db } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import {
  catalogQuerySchema,
  createCatalogService,
  type PokemonRecord,
} from '../../src/server/catalog'

const names = [
  'bulbasaur',
  'ivysaur',
  'venusaur',
  'charmander',
  'charmeleon',
  'charizard',
] as const

function resource(name: string, id: number, kind = 'pokemon') {
  return { name, url: `https://pokeapi.co/api/v2/${kind}/${id}/` }
}

function nameAt(id: number) {
  const name = names[id - 1]
  if (name === undefined) throw new Error(`Missing fixture name for ${id}`)
  return name
}

function pokemonPayload(name: string, id: number, speciesUrl?: string) {
  return {
    id,
    name,
    height: 10,
    weight: 100,
    sprites: {
      front_default: null,
      other: { 'official-artwork': { front_default: null } },
    },
    species: {
      ...resource(name, id, 'pokemon-species'),
      url: speciesUrl ?? resource(name, id, 'pokemon-species').url,
    },
    types: [
      { slot: 1, type: resource(id <= 3 ? 'grass' : 'fire', id, 'type') },
    ],
    stats: [{ base_stat: id * 10, stat: resource('speed', 6, 'stat') }],
    abilities: [
      { ability: resource('overgrow', 65, 'ability'), is_hidden: false },
    ],
  }
}

function speciesPayload(id: number) {
  return {
    generation: resource('generation-i', 1, 'generation'),
    genera: [
      { genus: `Species ${id}`, language: { name: 'en' } },
      { genus: `Especie ${id}`, language: { name: 'es' } },
    ],
    names: [{ name: nameAt(id), language: { name: 'es' } }],
    flavor_text_entries: [
      {
        flavor_text: `Descripción de ${nameAt(id)}.`,
        language: { name: 'es' },
      },
    ],
  }
}

function createFixture(speciesUrl?: string) {
  const cache = new Map<number, PokemonRecord>()
  const collection = {
    findOne: vi.fn(
      async (filter: { pokemonId?: number; nameNormalized?: string }) =>
        filter.pokemonId
          ? (cache.get(filter.pokemonId) ?? null)
          : ([...cache.values()].find(
              (entry) => entry.nameNormalized === filter.nameNormalized,
            ) ?? null),
    ),
    updateOne: vi.fn(
      async (_filter: unknown, update: { $set: PokemonRecord }) => {
        cache.set(update.$set.pokemonId, update.$set)
        return { acknowledged: true }
      },
    ),
  }
  const database = { collection: () => collection } as unknown as Db
  const fetcher = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url === 'https://graphql.pokeapi.co/v1beta2') {
        const requestBody = String(init?.body)
        const request = JSON.parse(requestBody) as { query: string }
        if (request.query.includes('CatalogFilterOptions')) {
          return Response.json({
            data: {
              ability: [
                {
                  name: 'overgrow',
                  abilitynames: [
                    { name: 'Espesura', language: { name: 'es' } },
                  ],
                },
              ],
              categories: [
                { genus: 'Pokémon Lagartija' },
                { genus: 'Pokémon Semilla' },
              ],
            },
          })
        }
        if (request.query.includes('CatalogCandidates')) {
          const ids = requestBody.includes('Pokémon Lagartija')
            ? [4, 5, 6]
            : request.query.includes('generation_id: desc')
              ? [4, 5, 6, 1, 2, 3]
              : [1, 2, 3, 4, 5, 6]
          return Response.json({
            data: {
              rows: ids.map((id) => ({ id, name: nameAt(id) })),
            },
          })
        }
        const ids = request.query.includes('base_stat: desc')
          ? [6, 5, 4, 3, 2, 1]
          : [1, 2, 3, 4, 5, 6]
        return Response.json({
          data: {
            rows: ids.map((id) => ({
              pokemon: { id, name: nameAt(id) },
            })),
          },
        })
      }
      if (url.endsWith('/ability/overgrow')) {
        return Response.json({
          name: 'overgrow',
          names: [{ name: 'Espesura', language: { name: 'es' } }],
          flavor_text_entries: [
            {
              flavor_text: 'Potencia los movimientos de tipo Planta.',
              language: { name: 'es' },
            },
          ],
          pokemon: [1, 2, 4, 6].map((id) => ({
            pokemon: resource(nameAt(id), id),
          })),
        })
      }
      if (url.endsWith('/type/grass')) {
        return Response.json({
          pokemon: [3, 1, 2, 6].map((id) => ({
            pokemon: resource(nameAt(id), id),
          })),
        })
      }
      if (url.endsWith('/type/fire')) {
        return Response.json({
          pokemon: [6, 4, 2, 5, 1, 3].map((id) => ({
            pokemon: resource(nameAt(id), id),
          })),
        })
      }
      if (url.endsWith('/generation/generation-i')) {
        return Response.json({
          pokemon_species: [1, 2, 3, 4, 5].map((id) =>
            resource(nameAt(id), id, 'pokemon-species'),
          ),
        })
      }
      if (url.includes('/pokemon?')) {
        return Response.json({
          count: names.length,
          results: names.map((name, index) => resource(name, index + 1)),
        })
      }
      const speciesMatch = url.match(/pokemon-species\/(\d+)/)
      if (speciesMatch)
        return Response.json(speciesPayload(Number(speciesMatch[1])))
      const pokemonMatch = url.match(/pokemon\/([^/?]+)$/)
      const matchedName = pokemonMatch?.[1]
      if (matchedName !== undefined) {
        const numericId = Number(matchedName)
        const id = Number.isInteger(numericId)
          ? numericId
          : names.indexOf(matchedName as (typeof names)[number]) + 1
        return Response.json(pokemonPayload(nameAt(id), id, speciesUrl))
      }
      return new Response(null, { status: 404 })
    },
  )
  return {
    fetcher,
    service: createCatalogService({ database, fetch: fetcher as typeof fetch }),
  }
}

describe('catalog filters and sorting', () => {
  it('intersects type and generation, then searches before hydration', async () => {
    const { fetcher, service } = createFixture()
    const result = await service.list({
      type: 'grass',
      generation: 'generation-i',
      query: 'saur',
      sort: 'id-asc',
      page: 1,
      limit: 5,
    })

    expect(result.items.map((item) => item.name)).toEqual([
      'bulbasaur',
      'ivysaur',
      'venusaur',
    ])
    expect(result.total).toBe(3)
    expect(fetcher).not.toHaveBeenCalledWith(
      expect.stringContaining('/pokemon/charizard'),
      expect.anything(),
    )
  })

  it.each([
    ['id-asc', ['bulbasaur', 'ivysaur', 'venusaur', 'charizard']],
    ['id-desc', ['charizard', 'venusaur', 'ivysaur', 'bulbasaur']],
    ['name-asc', ['bulbasaur', 'charizard', 'ivysaur', 'venusaur']],
    ['name-desc', ['venusaur', 'ivysaur', 'charizard', 'bulbasaur']],
  ] as const)(
    'sorts the full candidate set with %s',
    async (sort, expected) => {
      const { service } = createFixture()
      const result = await service.list({
        type: 'grass',
        sort,
        page: 1,
        limit: 5,
      })
      expect(result.items.map((item) => item.name)).toEqual(expected)
    },
  )

  it('paginates candidates before hydrating visible details', async () => {
    const { fetcher, service } = createFixture()
    const result = await service.list({
      type: 'fire',
      page: 2,
      limit: 5,
      sort: 'id-asc',
    })
    expect(result).toMatchObject({ total: 6, pages: 2, page: 2 })
    expect(result.items.map((item) => item.name)).toEqual(['charizard'])
    const detailRequests = fetcher.mock.calls
      .map(([input]) => String(input))
      .filter((url) => /\/pokemon\/[^?]+$/.test(url))
    expect(detailRequests).toEqual(['https://pokeapi.co/api/v2/pokemon/6'])
  })

  it('filters by ability and intersects it with the other active filters', async () => {
    const { service } = createFixture()
    const result = await service.list({
      type: 'fire',
      ability: 'overgrow',
      sort: 'id-asc',
      page: 1,
      limit: 5,
    })

    expect(result.items.map((item) => item.name)).toEqual([
      'bulbasaur',
      'ivysaur',
      'charmander',
      'charizard',
    ])
  })

  it('orders the complete result set by a requested base statistic', async () => {
    const { service } = createFixture()
    const result = await service.list({
      sort: 'speed-desc',
      page: 1,
      limit: 5,
    })

    expect(result.items.map((item) => item.name)).toEqual([
      'charizard',
      'charmeleon',
      'charmander',
      'venusaur',
      'ivysaur',
    ])
    expect(result).toMatchObject({ total: 6, pages: 2 })
  })

  it('filters by localized Pokedex category', async () => {
    const { service } = createFixture()
    const result = await service.list({
      category: 'Pokémon Lagartija',
      sort: 'id-asc',
      page: 1,
      limit: 5,
    })

    expect(result.items.map((item) => item.name)).toEqual([
      'charmander',
      'charmeleon',
      'charizard',
    ])
  })

  it('orders generations globally while preserving Pokedex order within each one', async () => {
    const { service } = createFixture()
    const result = await service.list({
      sort: 'generation-desc',
      page: 1,
      limit: 5,
    })

    expect(result.items.map((item) => item.name)).toEqual([
      'charmander',
      'charmeleon',
      'charizard',
      'bulbasaur',
      'ivysaur',
    ])
  })

  it('loads Spanish autocomplete options and ability descriptions', async () => {
    const { service } = createFixture()

    await expect(service.listFilterOptions()).resolves.toEqual({
      abilities: [{ value: 'overgrow', label: 'Espesura' }],
      categories: [
        { value: 'Pokémon Lagartija', label: 'Lagartija' },
        { value: 'Pokémon Semilla', label: 'Semilla' },
      ],
    })
    await expect(service.getPokemonDetail(1)).resolves.toMatchObject({
      displayName: 'bulbasaur',
      genus: 'Especie 1',
      description: 'Descripción de bulbasaur.',
      abilities: [
        {
          name: 'overgrow',
          displayName: 'Espesura',
          description: 'Potencia los movimientos de tipo Planta.',
        },
      ],
    })
  })

  it('searches the general index and rejects unsupported provider filters', async () => {
    const { service } = createFixture()
    const result = await service.list({
      query: 'char',
      sort: 'name-desc',
      limit: 5,
    })
    expect(result.items.map((item) => item.name)).toEqual([
      'charmeleon',
      'charmander',
      'charizard',
    ])
    expect(
      catalogQuerySchema.safeParse({ type: 'https://evil.test/type' }).success,
    ).toBe(false)
    expect(
      catalogQuerySchema.safeParse({ generation: 'generation-x' }).success,
    ).toBe(false)
    expect(catalogQuerySchema.safeParse({ sort: 'weight-desc' }).success).toBe(
      false,
    )
    expect(
      catalogQuerySchema.safeParse({ ability: 'https://evil.test/ability' })
        .success,
    ).toBe(false)
    expect(catalogQuerySchema.safeParse({ sort: 'speed-desc' }).success).toBe(
      true,
    )
    expect(
      catalogQuerySchema.safeParse({ sort: 'generation-desc' }).success,
    ).toBe(true)
    expect(
      catalogQuerySchema.safeParse({ category: 'Pokémon Ratón' }).success,
    ).toBe(true)
    expect(
      catalogQuerySchema.safeParse({ category: 'Ratón/../../etc' }).success,
    ).toBe(false)
  })

  it('rebuilds species requests from the trusted PokéAPI origin', async () => {
    const untrustedUrl = 'http://127.0.0.1:27017/pokemon-species/1/'
    const { fetcher, service } = createFixture(untrustedUrl)

    await service.getPokemon(1)

    expect(fetcher).toHaveBeenCalledWith(
      'https://pokeapi.co/api/v2/pokemon-species/1',
      expect.anything(),
    )
    expect(fetcher).not.toHaveBeenCalledWith(untrustedUrl, expect.anything())
  })
})
