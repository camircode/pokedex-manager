import { z } from 'zod'

export const POKEAPI_URL = 'https://pokeapi.co/api/v2'
export const CACHE_TTL_MS = 24 * 60 * 60 * 1_000
export const CACHE_SCHEMA_VERSION = 3
export const MAX_POKEMON_ID = 1025
export const SPANISH_LANGUAGES = ['es', 'es-419'] as const

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
  names: z
    .array(
      z.object({ name: z.string(), language: z.object({ name: z.string() }) }),
    )
    .default([]),
  flavor_text_entries: z
    .array(
      z.object({
        flavor_text: z.string(),
        language: z.object({ name: z.string() }),
      }),
    )
    .default([]),
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
const abilityPayloadSchema = z.object({
  name: z.string(),
  names: z.array(
    z.object({ name: z.string(), language: z.object({ name: z.string() }) }),
  ),
  flavor_text_entries: z.array(
    z.object({
      flavor_text: z.string(),
      language: z.object({ name: z.string() }),
    }),
  ),
})

export const pokemonIdentifierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(?:[1-9]\d{0,3}|[a-z0-9]+(?:-[a-z0-9]+)*)$/)

export type FetchLike = typeof fetch
export type NamedResource = z.infer<typeof namedResourceSchema>
export type CatalogCandidate = { id: number; name: string }

export type PokemonRecord = {
  cacheVersion?: number
  pokemonId: number
  name: string
  nameNormalized: string
  displayName?: string
  types: string[]
  stats: Array<{ name: string; value: number }>
  abilities: Array<{
    name: string
    hidden: boolean
    displayName?: string
    description?: string | null
  }>
  catalogSprite?: string | null
  sprite: string | null
  species: string
  genus: string | null
  description?: string | null
  generation: string
  height: number
  weight: number
  sourceUpdatedAt: Date
  freshUntil: Date
}

export type PokemonDetailRecord = Omit<PokemonRecord, 'abilities'> & {
  abilities: Array<{
    name: string
    hidden: boolean
    displayName: string
    description: string | null
  }>
}

export class CatalogError extends Error {
  readonly status: number

  constructor(message = 'No se pudo consultar PokéAPI.', status = 502) {
    super(message)
    this.name = 'CatalogError'
    this.status = status
  }
}

export function localizedValue<T extends { language: { name: string } }>(
  entries: T[],
  value: (entry: T) => string,
) {
  for (const language of SPANISH_LANGUAGES) {
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index]
      if (entry?.language.name === language) return value(entry)
    }
  }
  return undefined
}

export function normalizeFlavorText(value: string) {
  return value
    .replace(/[\n\f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function displayIdentifier(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function resourceCandidate(resource: NamedResource) {
  const id = Number(
    resource.url.match(/\/(?:pokemon|pokemon-species)\/(\d+)\/?$/)?.[1],
  )
  if (!Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) return undefined
  return { id, name: resource.name }
}

export function trustedSpeciesUrl(resource: NamedResource) {
  const id = Number(resource.url.match(/\/pokemon-species\/(\d+)\/?$/)?.[1])
  if (!Number.isInteger(id) || id < 1 || id > MAX_POKEMON_ID) {
    throw new CatalogError()
  }
  return `${POKEAPI_URL}/pokemon-species/${id}`
}

export function trustedAbilityUrl(name: string) {
  const parsed = pokemonIdentifierSchema.parse(name)
  return `${POKEAPI_URL}/ability/${encodeURIComponent(parsed)}`
}

export function sortCandidates<T extends CatalogCandidate>(
  candidates: T[],
  sort: string,
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

export function parsePokemonPayload(input: unknown) {
  return pokemonPayloadSchema.parse(input)
}

export function parseListPayload(input: unknown) {
  return listPayloadSchema.parse(input)
}

export function parseTypePayload(input: unknown) {
  return typePayloadSchema.parse(input)
}

export function parseGenerationPayload(input: unknown) {
  return generationPayloadSchema.parse(input)
}

export function parseAbilityPayload(input: unknown) {
  return abilityPayloadSchema.parse(input)
}

export function normalizePokemon(
  pokemonInput: unknown,
  speciesInput: unknown,
  now = new Date(),
): PokemonRecord {
  const pokemon = pokemonPayloadSchema.parse(pokemonInput)
  const species = speciesPayloadSchema.parse(speciesInput)
  const displayName =
    localizedValue(species.names, (entry) => entry.name) ??
    displayIdentifier(pokemon.name)
  const description = localizedValue(species.flavor_text_entries, (entry) =>
    normalizeFlavorText(entry.flavor_text),
  )
  return {
    cacheVersion: CACHE_SCHEMA_VERSION,
    pokemonId: pokemon.id,
    name: pokemon.name,
    nameNormalized: pokemon.name.toLowerCase(),
    displayName,
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
    catalogSprite: pokemon.sprites.front_default,
    sprite:
      pokemon.sprites.other?.['official-artwork'].front_default ??
      pokemon.sprites.front_default,
    species: pokemon.species.name,
    genus:
      localizedValue(species.genera, (entry) => entry.genus) ??
      species.genera.find((entry) => entry.language.name === 'en')?.genus ??
      null,
    description: description ?? null,
    generation: species.generation.name,
    height: pokemon.height,
    weight: pokemon.weight,
    sourceUpdatedAt: now,
    freshUntil: new Date(now.getTime() + CACHE_TTL_MS),
  }
}
