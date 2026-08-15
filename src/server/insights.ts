import '@tanstack/react-start/server-only'

import { createHash } from 'node:crypto'

import type { Db, WithId } from 'mongodb'

import {
  type CollectionEntry,
  calculateDashboardStats,
  createCollectionService,
  type DashboardStats,
  getCollectionService,
} from '@/server/collection'
import { getMongoClient } from '@/server/db/mongo-client'
import {
  createConfiguredKimiInsightsAdapter,
  type InsightsProposalPort,
  KIMI_MODEL,
  loadKimiConfig,
} from '@/server/integrations/kimi'

export type InsightFact = {
  key: string
  label: string
  fact: string
}

export type AiInsight = {
  userId: string
  type: 'collection-overview'
  collectionVersion: string
  headline: string
  summary: string
  findings: Array<InsightFact & { interpretation: string }>
  model: typeof KIMI_MODEL
  createdAt: Date
}

export type InsightsCapability = {
  kimi: boolean
  model: typeof KIMI_MODEL
}

export type InsightsResponse = {
  analysis: AiInsight | null
  stats: DashboardStats
  capability: InsightsCapability
}

export type InsightsActivityPhase =
  | 'collecting'
  | 'preparing'
  | 'interpreting'
  | 'validating'
  | 'persisting'

export type InsightsActivityEvent = {
  type: 'phase'
  phase: InsightsActivityPhase
}

type CollectionPort = {
  list(userId: string): Promise<CollectionEntry[]>
}

export class InsightsEmptyCollectionError extends Error {
  readonly status = 400

  constructor() {
    super('Agrega Pokémon a tu colección antes de generar hallazgos.')
    this.name = 'InsightsEmptyCollectionError'
  }
}

function collectionVersion(entries: CollectionEntry[]) {
  const canonical = [...entries]
    .sort((left, right) => left.pokemonId - right.pokemonId)
    .map((entry) => ({
      pokemonId: entry.pokemonId,
      quantity: entry.quantity,
      favorite: entry.favorite,
      types: [...entry.pokemon.types].sort(),
      generation: entry.pokemon.generation,
    }))
  return createHash('sha256')
    .update(JSON.stringify(canonical))
    .digest('hex')
    .slice(0, 24)
}

export function buildInsightFacts(
  entries: CollectionEntry[],
  stats = calculateDashboardStats(entries),
): InsightFact[] {
  const dominant = stats.typeDistribution[0]
  const generations = new Map<string, number>()
  for (const entry of entries) {
    generations.set(
      entry.pokemon.generation,
      (generations.get(entry.pokemon.generation) ?? 0) + 1,
    )
  }
  const generationFact = [...generations.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .map(([generation, count]) => `${generation}: ${count}`)
    .join(', ')

  return [
    {
      key: 'collection-size',
      label: 'Tamaño de colección',
      fact: `${stats.totalUnique} ${stats.totalUnique === 1 ? 'especie' : 'especies'} y ${stats.totalQuantity} ${stats.totalQuantity === 1 ? 'ejemplar' : 'ejemplares'}.`,
    },
    {
      key: 'type-distribution',
      label: 'Distribución de tipos',
      fact: `${stats.typeDistribution.length} tipos representados${dominant ? `; mayor presencia: ${dominant.type} (${dominant.count})` : ''}.`,
    },
    {
      key: 'favorites',
      label: 'Curaduría',
      fact: `${stats.favorites} especies marcadas como favoritas.`,
    },
    {
      key: 'generations',
      label: 'Generaciones',
      fact: generationFact || 'No hay generaciones representadas.',
    },
  ]
}

function cleanInsight(document: WithId<AiInsight>): AiInsight {
  const { _id: _ignored, ...insight } = document
  return insight
}

export function getInsightsCapability(
  input: NodeJS.ProcessEnv = process.env,
): InsightsCapability {
  try {
    const config = loadKimiConfig(input)
    return {
      kimi: config.enabled && config.apiKey !== undefined,
      model: KIMI_MODEL,
    }
  } catch {
    return { kimi: false, model: KIMI_MODEL }
  }
}

export function createInsightsService(
  database: Db,
  options: { collection?: CollectionPort; now?: () => Date } = {},
) {
  const insights = database.collection<AiInsight>('ai_insights')
  const collection = options.collection ?? createCollectionService(database)
  const now = options.now ?? (() => new Date())

  async function snapshot(userId: string) {
    const entries = await collection.list(userId)
    const stats = calculateDashboardStats(entries)
    return {
      entries,
      stats,
      version: collectionVersion(entries),
      facts: buildInsightFacts(entries, stats),
    }
  }

  async function current(userId: string): Promise<InsightsResponse> {
    const state = await snapshot(userId)
    const stored = await insights.findOne({
      userId,
      type: 'collection-overview',
      collectionVersion: state.version,
    })
    return {
      analysis: stored === null ? null : cleanInsight(stored),
      stats: state.stats,
      capability: getInsightsCapability(),
    }
  }

  async function generate(
    userId: string,
    proposal: InsightsProposalPort,
    report?: (event: InsightsActivityEvent) => void | Promise<void>,
  ) {
    await report?.({ type: 'phase', phase: 'collecting' })
    const state = await snapshot(userId)
    if (state.entries.length === 0) throw new InsightsEmptyCollectionError()

    await report?.({ type: 'phase', phase: 'preparing' })
    const factsByKey = new Map(state.facts.map((fact) => [fact.key, fact]))
    await report?.({ type: 'phase', phase: 'interpreting' })
    const generated = await proposal.propose({ facts: state.facts })
    await report?.({ type: 'phase', phase: 'validating' })
    const findings = generated.findings.map((finding) => {
      const fact = factsByKey.get(finding.factKey)
      if (fact === undefined) throw new Error('Invalid verified insight fact')
      return { ...fact, interpretation: finding.interpretation }
    })
    const insight: AiInsight = {
      userId,
      type: 'collection-overview',
      collectionVersion: state.version,
      headline: generated.headline,
      summary: generated.summary,
      findings,
      model: KIMI_MODEL,
      createdAt: now(),
    }

    await report?.({ type: 'phase', phase: 'persisting' })
    await insights.replaceOne(
      {
        userId,
        type: 'collection-overview',
        collectionVersion: state.version,
      },
      insight,
      { upsert: true },
    )
    return insight
  }

  return { current, generate }
}

export async function getInsightsResponse(userId: string) {
  return createInsightsService(await getMongoClient().connect()).current(userId)
}

export async function generateInsightsWithKimi(
  userId: string,
  report?: (event: InsightsActivityEvent) => void | Promise<void>,
) {
  const [database, collection] = await Promise.all([
    getMongoClient().connect(),
    getCollectionService(),
  ])
  return createInsightsService(database, { collection }).generate(
    userId,
    createConfiguredKimiInsightsAdapter(),
    report,
  )
}
