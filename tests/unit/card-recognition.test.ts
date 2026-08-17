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
  it('uses the MCP tool result as the authoritative candidate', async () => {
    const analyzeImageWithTool = vi.fn(async () => ({
      id: 'call-1',
      name: 'get_pokemon',
      arguments: JSON.stringify({ pokemonId: 25 }),
    }))
    const callTool = vi.fn(async () => ({
      operation: 'get_pokemon' as const,
      subject: 'scan-user',
      data: pokemon(),
    }))
    const close = vi.fn(async () => undefined)
    const service = createCardRecognitionService({
      kimi: { analyzeImageWithTool },
      createMcpClient: async () => ({
        listTools: async () => [
          {
            name: 'get_pokemon',
            description: 'Verified Pokémon details.',
            inputSchema: { type: 'object' },
          },
        ],
        callTool,
        close,
      }),
    })

    await expect(
      service.recognize({ bytes: png, mediaType: 'image/png' }),
    ).resolves.toMatchObject({
      pokemonId: 25,
      name: 'pikachu',
      evidence: [{ source: 'Kimi' }, { source: 'PokéAPI' }],
    })
    expect(analyzeImageWithTool).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        function: expect.objectContaining({ name: 'get_pokemon' }),
      }),
      expect.any(Object),
    )
    expect(callTool).toHaveBeenCalledWith('get_pokemon', { pokemonId: 25 })
    expect(close).toHaveBeenCalledOnce()
  })

  it('does not expose a provider candidate rejected by MCP', async () => {
    const close = vi.fn(async () => undefined)
    const service = createCardRecognitionService({
      kimi: {
        analyzeImageWithTool: vi.fn(async () => ({
          id: 'call-1',
          name: 'get_pokemon',
          arguments: JSON.stringify({ pokemonId: 'mew-ex' }),
        })),
      },
      createMcpClient: async () => ({
        listTools: async () => [
          {
            name: 'get_pokemon',
            description: 'Verified Pokémon details.',
            inputSchema: { type: 'object' },
          },
        ],
        callTool: async () => ({
          operation: 'get_pokemon' as const,
          subject: 'scan-user',
          data: { error: 'Read-only operation unavailable' },
        }),
        close,
      }),
    })

    await expect(
      service.recognize({ bytes: png, mediaType: 'image/png' }),
    ).rejects.toBeInstanceOf(RecognitionVerificationError)
    expect(close).toHaveBeenCalledOnce()
  })
})
