import { describe, expect, it } from 'vitest'

import {
  isPokemonDetailNavigation,
  pokemonDetailTransitionId,
  pokemonTransitionStyle,
} from '../../src/lib/pokemon-view-transition'

describe('Pokemon detail view-transition routing', () => {
  it('recognizes list-detail navigation in either direction', () => {
    expect(isPokemonDetailNavigation('/app/pokedex', '/app/pokedex/25')).toBe(
      true,
    )
    expect(isPokemonDetailNavigation('/app/pokedex/25', '/app/pokedex/')).toBe(
      true,
    )
    expect(
      isPokemonDetailNavigation('/app/pokedex/25', '/app/collection'),
    ).toBe(false)
    expect(
      isPokemonDetailNavigation('/app/pokedex', '/app/pokedex?page=2'),
    ).toBe(false)
  })

  it.each(['artwork', 'name', 'number', 'types'] as const)(
    'assigns the shared %s name only while active',
    (part) => {
      expect(pokemonTransitionStyle(true, part)).toEqual({
        viewTransitionName: `pokemon-${part}`,
      })
      expect(pokemonTransitionStyle(false, part)).toBeUndefined()
    },
  )

  it('selects the numeric Pokemon involved in either direction', () => {
    expect(pokemonDetailTransitionId('/app/pokedex', '/app/pokedex/25')).toBe(
      25,
    )
    expect(pokemonDetailTransitionId('/app/pokedex/25', '/app/pokedex')).toBe(
      25,
    )
  })
})
