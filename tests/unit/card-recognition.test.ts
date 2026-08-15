import { describe, expect, it, vi } from 'vitest'

import {
  createCardRecognitionService,
  RecognitionVerificationError,
} from '../../src/server/card-recognition'
import type { PokemonRecord } from '../../src/server/catalog'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function pokemon(overrides: Partial<PokemonRecord> = {}): PokemonRecord {
  return {
    pokemonId: 25,
    name: 'pikachu',
    nameNormalized: 'pikachu',
    types: ['electric'],
    stats: [{ name: 'speed', value: 90 }],
    abilities: [{ name: 'static', hidden: false }],
    sprite: null,
    species: 'pikachu',
    genus: 'Mouse Pokémon',
    generation: 'generation-i',
    height: 4,
    weight: 60,
    sourceUpdatedAt: new Date('2026-01-01'),
    freshUntil: new Date('2027-01-01'),
    ...overrides,
  }
}

describe('card recognition boundary', () => {
  it('validates the provider result against both catalog identifiers', async () => {
    const analyzeImage = vi.fn(async () => ({
      pokemonId: 25,
      name: 'pikachu',
    }))
    const getPokemon = vi.fn(async () => pokemon())
    const service = createCardRecognitionService({
      kimi: { analyzeImage },
      catalog: { getPokemon },
    })

    await expect(
      service.recognize({ bytes: png, mediaType: 'image/png' }),
    ).resolves.toMatchObject({
      pokemonId: 25,
      name: 'pikachu',
      evidence: [{ source: 'Kimi' }, { source: 'PokéAPI' }],
    })
    expect(getPokemon).toHaveBeenNthCalledWith(1, 25)
    expect(getPokemon).toHaveBeenNthCalledWith(2, 'pikachu')
  })

  it('does not expose an unverified provider mismatch as a candidate', async () => {
    const service = createCardRecognitionService({
      kimi: {
        analyzeImage: vi.fn(async () => ({
          pokemonId: 25,
          name: 'raichu',
        })),
      },
      catalog: {
        getPokemon: vi.fn(async (identifier) =>
          identifier === 'raichu'
            ? pokemon({
                pokemonId: 26,
                name: 'raichu',
                nameNormalized: 'raichu',
              })
            : pokemon(),
        ),
      },
    })

    await expect(
      service.recognize({ bytes: png, mediaType: 'image/png' }),
    ).rejects.toBeInstanceOf(RecognitionVerificationError)
  })
})
