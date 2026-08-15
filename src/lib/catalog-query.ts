import { z } from 'zod'

export const POKEMON_TYPES = [
  'normal',
  'fire',
  'water',
  'electric',
  'grass',
  'ice',
  'fighting',
  'poison',
  'ground',
  'flying',
  'psychic',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const

export const POKEMON_GENERATIONS = [
  'generation-i',
  'generation-ii',
  'generation-iii',
  'generation-iv',
  'generation-v',
  'generation-vi',
  'generation-vii',
  'generation-viii',
  'generation-ix',
] as const

export const CATALOG_SORTS = [
  'id-asc',
  'id-desc',
  'name-asc',
  'name-desc',
] as const

export const catalogQuerySchema = z.object({
  query: z.string().trim().toLowerCase().max(40).default(''),
  type: z.union([z.literal(''), z.enum(POKEMON_TYPES)]).default(''),
  generation: z.union([z.literal(''), z.enum(POKEMON_GENERATIONS)]).default(''),
  sort: z.enum(CATALOG_SORTS).default('id-asc'),
  page: z.coerce.number().int().min(1).max(205).default(1),
  limit: z.coerce.number().int().min(5).max(25).default(20),
})

export const pokemonDetailSearchSchema = catalogQuerySchema.extend({
  from: z.literal('catalog').optional(),
})

export type CatalogQuery = z.infer<typeof catalogQuerySchema>

export const catalogSearchDefaults: CatalogQuery = {
  query: '',
  type: '',
  generation: '',
  sort: 'id-asc',
  page: 1,
  limit: 20,
}

export function buildCatalogApiUrl(query: CatalogQuery) {
  const parameters = new URLSearchParams({
    query: query.query,
    type: query.type,
    generation: query.generation,
    sort: query.sort,
    page: String(query.page),
    limit: String(query.limit),
  })
  return `/api/catalog?${parameters.toString()}`
}
