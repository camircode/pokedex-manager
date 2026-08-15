import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')

describe('catalog architecture boundary', () => {
  it('keeps persistence separate from provider integrations', () => {
    const service = read('src/server/catalog.ts')
    const model = read('src/server/catalog/model.ts')
    const rest = read('src/server/catalog/pokeapi.ts')
    const graphql = read('src/server/catalog/graphql.ts')

    expect(service).toContain('createPokeApiClient(fetcher)')
    expect(service).toContain('createCatalogGraphqlClient(fetcher, now)')
    expect(service).toContain("collection<PokemonRecord>('pokemon_cache')")
    for (const providerModule of [model, rest, graphql]) {
      expect(providerModule).not.toContain("from 'mongodb'")
      expect(providerModule).not.toContain('getMongoClient')
    }
  })
})
