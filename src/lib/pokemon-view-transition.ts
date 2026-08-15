import type { CSSProperties } from 'react'

type PokemonTransitionPart = 'artwork' | 'name' | 'number' | 'types'

export function pokemonTransitionStyle(
  active: boolean,
  part: PokemonTransitionPart,
): CSSProperties | undefined {
  if (!active) return undefined
  return { viewTransitionName: `pokemon-${part}` }
}

function normalizedPath(pathname: string | undefined) {
  if (pathname === undefined) return ''
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
}

export function isPokemonDetailNavigation(
  fromPathname: string | undefined,
  toPathname: string,
) {
  const from = normalizedPath(fromPathname)
  const to = normalizedPath(toPathname)
  const listPath = '/app/pokedex'
  const isDetailPath = (pathname: string) =>
    /^\/app\/pokedex\/[^/]+$/.test(pathname)

  return (
    (from === listPath && isDetailPath(to)) ||
    (isDetailPath(from) && to === listPath)
  )
}

function detailPokemonId(pathname: string) {
  const match = pathname.match(/^\/app\/pokedex\/([1-9]\d{0,3})$/)
  if (match === null) return undefined
  const pokemonId = Number(match[1])
  return pokemonId <= 9_999 ? pokemonId : undefined
}

export function pokemonDetailTransitionId(
  fromPathname: string | undefined,
  toPathname: string,
) {
  if (!isPokemonDetailNavigation(fromPathname, toPathname)) return undefined
  const from = normalizedPath(fromPathname)
  const to = normalizedPath(toPathname)
  return detailPokemonId(from) ?? detailPokemonId(to)
}
