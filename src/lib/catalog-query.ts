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

export const POKEMON_STATS = [
  'hp',
  'attack',
  'defense',
  'special-attack',
  'special-defense',
  'speed',
] as const

export const POKEMON_TYPE_LABELS: Record<
  (typeof POKEMON_TYPES)[number],
  string
> = {
  normal: 'Normal',
  fire: 'Fuego',
  water: 'Agua',
  electric: 'Eléctrico',
  grass: 'Planta',
  ice: 'Hielo',
  fighting: 'Lucha',
  poison: 'Veneno',
  ground: 'Tierra',
  flying: 'Volador',
  psychic: 'Psíquico',
  bug: 'Bicho',
  rock: 'Roca',
  ghost: 'Fantasma',
  dragon: 'Dragón',
  dark: 'Siniestro',
  steel: 'Acero',
  fairy: 'Hada',
}

export const POKEMON_STAT_LABELS: Record<
  (typeof POKEMON_STATS)[number],
  string
> = {
  hp: 'Puntos de salud',
  attack: 'Ataque',
  defense: 'Defensa',
  'special-attack': 'Ataque especial',
  'special-defense': 'Defensa especial',
  speed: 'Velocidad',
}

export const CATALOG_SORTS = [
  'id-asc',
  'id-desc',
  'name-asc',
  'name-desc',
  'generation-asc',
  'generation-desc',
  'hp-asc',
  'hp-desc',
  'attack-asc',
  'attack-desc',
  'defense-asc',
  'defense-desc',
  'special-attack-asc',
  'special-attack-desc',
  'special-defense-asc',
  'special-defense-desc',
  'speed-asc',
  'speed-desc',
] as const

const providerIdentifierSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(60)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
const categoryIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N} .'-]+$/u)

export const catalogQuerySchema = z.object({
  query: z.string().trim().toLowerCase().max(40).default(''),
  type: z.union([z.literal(''), z.enum(POKEMON_TYPES)]).default(''),
  generation: z.union([z.literal(''), z.enum(POKEMON_GENERATIONS)]).default(''),
  ability: z.union([z.literal(''), providerIdentifierSchema]).default(''),
  category: z.union([z.literal(''), categoryIdentifierSchema]).default(''),
  sort: z.enum(CATALOG_SORTS).default('id-asc'),
  page: z.coerce.number().int().min(1).max(205).default(1),
  limit: z.coerce.number().int().min(5).max(25).default(20),
})

export const pokemonDetailSearchSchema = catalogQuerySchema.extend({
  from: z.literal('catalog').optional(),
})

export type CatalogQuery = z.infer<typeof catalogQuerySchema>
export type CatalogAbilityOption = { value: string; label: string }
export type CatalogCategoryOption = { value: string; label: string }
export type CatalogFilterOptions = {
  abilities: CatalogAbilityOption[]
  categories: CatalogCategoryOption[]
}

export const catalogSearchDefaults: CatalogQuery = {
  query: '',
  type: '',
  generation: '',
  ability: '',
  category: '',
  sort: 'id-asc',
  page: 1,
  limit: 20,
}

export function buildCatalogApiUrl(query: CatalogQuery) {
  const parameters = new URLSearchParams({
    query: query.query,
    type: query.type,
    generation: query.generation,
    ability: query.ability,
    category: query.category,
    sort: query.sort,
    page: String(query.page),
    limit: String(query.limit),
  })
  return `/api/catalog?${parameters.toString()}`
}

export function pokemonTypeLabel(type: string) {
  return POKEMON_TYPE_LABELS[type as (typeof POKEMON_TYPES)[number]] ?? type
}

export function pokemonStatLabel(stat: string) {
  return POKEMON_STAT_LABELS[stat as (typeof POKEMON_STATS)[number]] ?? stat
}
