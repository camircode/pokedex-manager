import '@tanstack/react-start/server-only'

import { z } from 'zod'

import type {
  AssistantCitation,
  AssistantToolOperation,
} from '@/server/assistant/contracts'

const pokemonContextSchema = z.object({
  pokemonId: z.number().int(),
  name: z.string(),
  types: z.array(z.string()),
  stats: z.array(z.object({ name: z.string(), value: z.number() })),
  generation: z.string(),
})
const catalogSearchContextSchema = z.object({
  items: z.array(pokemonContextSchema),
  total: z.number().int(),
})
const collectionContextSchema = z.array(
  z.object({
    pokemon: z.object({ name: z.string() }),
    quantity: z.number().int(),
  }),
)
const statsContextSchema = z.object({
  totalUnique: z.number().int(),
  totalQuantity: z.number().int(),
  favorites: z.number().int(),
  typeDistribution: z.array(
    z.object({ type: z.string(), count: z.number().int() }),
  ),
})
const researchContextSchema = z
  .object({
    title: z.string(),
    objectives: z.array(z.object({ label: z.string(), complete: z.boolean() })),
    generation: z.object({
      mode: z.literal('kimi'),
      model: z.string(),
    }),
  })
  .nullable()
const unavailableToolContextSchema = z.object({
  error: z.string().min(1),
})

export type ToolAnswer = { answer: string; citations: AssistantCitation[] }

function displayName(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function pokemonCitation(
  pokemon: z.infer<typeof pokemonContextSchema>,
  id: number,
): AssistantCitation {
  return {
    id,
    label: displayName(pokemon.name),
    source: 'PokéAPI',
    fact: `#${pokemon.pokemonId}; tipos ${pokemon.types.map(displayName).join(', ')}; ${displayName(pokemon.generation)}`,
    href: `/app/pokedex/${pokemon.pokemonId}`,
  }
}

export function reindexToolAnswer(
  result: ToolAnswer,
  firstId: number,
): ToolAnswer {
  const idMap = new Map(
    result.citations.map((citation, index) => [citation.id, firstId + index]),
  )
  return {
    answer: result.answer.replace(/\[(\d+)]/g, (reference, value: string) => {
      const nextId = idMap.get(Number(value))
      return nextId === undefined ? reference : `[${nextId}]`
    }),
    citations: result.citations.map((citation) => ({
      ...citation,
      id: idMap.get(citation.id) as number,
    })),
  }
}

export function toolAnswerFromMcp(
  operation: AssistantToolOperation,
  data: unknown,
): ToolAnswer {
  if (unavailableToolContextSchema.safeParse(data).success) {
    return {
      answer:
        'Esta consulta de datos no pudo completarse. Ajusta los parámetros o continúa con otras herramientas y con los datos que ya verificaste.',
      citations: [],
    }
  }

  if (operation.name === 'search_pokemon') {
    const result = catalogSearchContextSchema.parse(data)
    const citations = result.items.map((pokemon, index) =>
      pokemonCitation(pokemon, index + 1),
    )
    return {
      answer:
        citations.length === 0
          ? 'No encontré coincidencias en el catálogo.'
          : `Encontré ${result.total} coincidencia${result.total === 1 ? '' : 's'}. En esta respuesta muestro ${citations.length}: ${citations.map((citation) => `${citation.label} [${citation.id}]`).join(', ')}.`,
      citations,
    }
  }

  if (operation.name === 'get_pokemon') {
    const pokemon = pokemonContextSchema.parse(data)
    const citation = pokemonCitation(pokemon, 1)
    const strongest = [...pokemon.stats].sort(
      (left, right) => right.value - left.value,
    )[0]
    return {
      answer: `${displayName(pokemon.name)} es de tipo ${pokemon.types.map(displayName).join(' / ')} y pertenece a ${displayName(pokemon.generation)}.${strongest ? ` Su estadística base más alta es ${displayName(strongest.name)} (${strongest.value}).` : ''} [1]`,
      citations: [citation],
    }
  }

  if (operation.name === 'list_my_collection') {
    const entries = collectionContextSchema.parse(data)
    const totalQuantity = entries.reduce(
      (sum, entry) => sum + entry.quantity,
      0,
    )
    const sample = entries.slice(0, 5)
    const citation: AssistantCitation = {
      id: 1,
      label: 'Resumen de colección',
      source: 'Colección',
      fact: `${entries.length} especies, ${totalQuantity} ejemplares; muestra: ${sample.map((entry) => `${displayName(entry.pokemon.name)} (${entry.quantity})`).join(', ') || 'vacía'}`,
      href: '/app/collection',
    }
    return {
      answer:
        entries.length === 0
          ? 'Tu colección todavía está vacía. Agrega una especie desde el índice Pokédex. [1]'
          : `Tu colección reúne ${entries.length} especies y ${totalQuantity} ejemplares. Los registros más recientes incluyen ${sample.map((entry) => displayName(entry.pokemon.name)).join(', ')}. [1]`,
      citations: [citation],
    }
  }

  if (operation.name === 'get_collection_stats') {
    const stats = statsContextSchema.parse(data)
    const dominant = stats.typeDistribution[0]
    const citation: AssistantCitation = {
      id: 1,
      label: 'Estadísticas calculadas',
      source: 'Estadísticas',
      fact: `${stats.totalUnique} especies, ${stats.totalQuantity} ejemplares, ${stats.favorites} favoritos${dominant ? `; tipo principal ${displayName(dominant.type)} (${dominant.count})` : ''}`,
      href: '/app/insights',
    }
    return {
      answer: `Tienes ${stats.totalUnique} especies, ${stats.totalQuantity} ejemplares y ${stats.favorites} favoritos.${dominant ? ` El tipo con mayor presencia es ${displayName(dominant.type)} (${dominant.count}).` : ''} [1]`,
      citations: [citation],
    }
  }

  if (operation.name === 'compare_pokemon') {
    const [left, right] = z
      .tuple([pokemonContextSchema, pokemonContextSchema])
      .parse(data)
    const total = (pokemon: z.infer<typeof pokemonContextSchema>) =>
      pokemon.stats.reduce((sum, stat) => sum + stat.value, 0)
    const leftTotal = total(left)
    const rightTotal = total(right)
    return {
      answer: `${displayName(left.name)} suma ${leftTotal} puntos de estadísticas base y ${displayName(right.name)} suma ${rightTotal}. ${leftTotal === rightTotal ? 'Tienen el mismo total, aunque su distribución puede variar.' : `${displayName(leftTotal > rightTotal ? left.name : right.name)} tiene el total mayor por ${Math.abs(leftTotal - rightTotal)} puntos.`} [1] [2]`,
      citations: [pokemonCitation(left, 1), pokemonCitation(right, 2)],
    }
  }

  const expedition = researchContextSchema.parse(data)
  if (expedition === null) {
    return {
      answer:
        'Todavía no tienes una investigación activa. Puedes generar una desde la sección Investigación. [1]',
      citations: [
        {
          id: 1,
          label: 'Investigación activa',
          source: 'Investigación',
          fact: 'No hay una investigación activa para esta cuenta.',
          href: '/app/research',
        },
      ],
    }
  }
  const pending = expedition.objectives.filter(
    (objective) => !objective.complete,
  )
  const citation: AssistantCitation = {
    id: 1,
    label: expedition.title,
    source: 'Investigación',
    fact: `${pending.length} objetivos pendientes de ${expedition.objectives.length}. Origen: Kimi ${expedition.generation.model}`,
    href: '/app/research',
  }
  return {
    answer: `Tu investigación activa es “${expedition.title}”. ${pending.length === 0 ? 'Todos los objetivos están completos.' : `Quedan ${pending.length} objetivos: ${pending.map((objective) => objective.label).join('; ')}.`} [1]`,
    citations: [citation],
  }
}
