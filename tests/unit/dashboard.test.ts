import { describe, expect, it } from 'vitest'

import {
  type CollectionEntry,
  calculateDashboardStats,
} from '../../src/server/collection'

function entry(
  pokemonId: number,
  quantity: number,
  types: string[],
  favorite = false,
): CollectionEntry {
  return {
    userId: 'user-a',
    pokemonId,
    pokemon: {
      name: `pokemon-${pokemonId}`,
      sprite: null,
      types,
      generation: 'generation-i',
    },
    quantity,
    nickname: null,
    notes: '',
    tags: [],
    favorite,
    createdAt: new Date(`2026-01-0${pokemonId}T00:00:00Z`),
    updatedAt: new Date(`2026-01-0${pokemonId}T00:00:00Z`),
  }
}

describe('dashboard stats', () => {
  it('calcula cantidades, favoritos, tipos y recientes de forma determinista', () => {
    const stats = calculateDashboardStats([
      entry(1, 2, ['grass', 'poison'], true),
      entry(2, 3, ['fire']),
      entry(3, 1, ['grass']),
    ])
    expect(stats).toMatchObject({
      totalUnique: 3,
      totalQuantity: 6,
      favorites: 1,
      typeDistribution: [
        { type: 'fire', count: 3 },
        { type: 'grass', count: 3 },
        { type: 'poison', count: 2 },
      ],
    })
    expect(stats.recent.map((item) => item.pokemonId)).toEqual([3, 2, 1])
  })
})
