import '@tanstack/react-start/server-only'

import type { Db, WithId } from 'mongodb'

import type { CollectionEntry } from '@/server/collection'
import { getCollectionService } from '@/server/collection'
import { getMongoClient } from '@/server/db/mongo-client'
import {
  createConfiguredKimiResearchAdapter,
  KIMI_MODEL,
  loadKimiConfig,
  type ResearchProposal,
  type ResearchProposalInput,
  type ResearchProposalPort,
} from '@/server/integrations/kimi'

const RESEARCH_TYPES = [
  'fire',
  'water',
  'grass',
  'electric',
  'psychic',
  'ground',
  'normal',
  'ice',
  'fighting',
  'poison',
  'flying',
  'bug',
  'rock',
  'ghost',
  'dragon',
  'dark',
  'steel',
  'fairy',
] as const

const TYPE_LABELS: Record<(typeof RESEARCH_TYPES)[number], string> = {
  normal: 'normal',
  fire: 'fuego',
  water: 'agua',
  electric: 'eléctrico',
  grass: 'planta',
  ice: 'hielo',
  fighting: 'lucha',
  poison: 'veneno',
  ground: 'tierra',
  flying: 'volador',
  psychic: 'psíquico',
  bug: 'bicho',
  rock: 'roca',
  ghost: 'fantasma',
  dragon: 'dragón',
  dark: 'siniestro',
  steel: 'acero',
  fairy: 'hada',
}

const RESEARCH_GENERATIONS = [
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

export type ResearchCriterion =
  | { kind: 'unique-count' }
  | { kind: 'has-type'; type: string }
  | { kind: 'has-generation'; generation: string }

export type ResearchObjective = {
  key: string
  label: string
  target: number
  progress: number
  complete: boolean
  criterion: ResearchCriterion
}

export type ResearchGeneration =
  | { mode: 'rules'; generatedAt: Date }
  | { mode: 'kimi'; model: typeof KIMI_MODEL; generatedAt: Date }

export type ResearchExpedition = {
  userId: string
  title: string
  premise: string
  status: 'active' | 'completed'
  baselineUnique: number
  objectives: ResearchObjective[]
  generation: ResearchGeneration
  createdAt: Date
  updatedAt: Date
}

type StoredResearchObjective = Omit<ResearchObjective, 'criterion'> & {
  criterion?: ResearchCriterion
}

type StoredResearchExpedition = Omit<
  ResearchExpedition,
  'generation' | 'objectives'
> & {
  generation?: ResearchGeneration
  objectives: StoredResearchObjective[]
}

type ExecutableCandidate = ResearchProposalInput['candidates'][number] & {
  objective: ResearchObjective
}

export type ResearchCapability = {
  kimi: boolean
  model: typeof KIMI_MODEL
}

export type ResearchResponse = {
  expedition: ResearchExpedition | null
  capability: ResearchCapability
}

export type ResearchActivityPhase =
  | 'collecting'
  | 'preparing'
  | 'generating'
  | 'validating'
  | 'persisting'

export type ResearchActivityEvent = {
  type: 'phase'
  phase: ResearchActivityPhase
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right))
}

export function analyzeResearchCollection(
  entries: CollectionEntry[],
): ResearchProposalInput['aggregate'] {
  const representedTypes = uniqueSorted(
    entries.flatMap((entry) => entry.pokemon.types),
  )
  const representedGenerations = uniqueSorted(
    entries.map((entry) => entry.pokemon.generation),
  )
  return {
    uniqueCount: entries.length,
    representedTypes,
    missingTypes: RESEARCH_TYPES.filter(
      (type) => !representedTypes.includes(type),
    ),
    representedGenerations,
  }
}

function createObjective(
  key: string,
  label: string,
  target: number,
  progress: number,
  criterion: ResearchCriterion,
): ResearchObjective {
  return {
    key,
    label,
    target,
    progress,
    complete: progress >= target,
    criterion,
  }
}

export function buildResearchCandidates(
  entries: CollectionEntry[],
): ExecutableCandidate[] {
  const aggregate = analyzeResearchCollection(entries)
  const candidates: ExecutableCandidate[] = [
    {
      key: 'expand-index',
      label: 'Registrar tres especies nuevas',
      objective: createObjective(
        'expand-index',
        'Registrar tres especies nuevas',
        aggregate.uniqueCount + 3,
        aggregate.uniqueCount,
        { kind: 'unique-count' },
      ),
    },
    {
      key: 'deepen-index',
      label: 'Registrar cinco especies nuevas',
      objective: createObjective(
        'deepen-index',
        'Registrar cinco especies nuevas',
        aggregate.uniqueCount + 5,
        aggregate.uniqueCount,
        { kind: 'unique-count' },
      ),
    },
  ]

  for (const type of aggregate.missingTypes.slice(0, 3)) {
    const label = `Registrar una especie de tipo ${TYPE_LABELS[type as keyof typeof TYPE_LABELS]}`
    candidates.push({
      key: `type-${type}`,
      label,
      objective: createObjective(`type-${type}`, label, 1, 0, {
        kind: 'has-type',
        type,
      }),
    })
  }

  const missingGeneration = RESEARCH_GENERATIONS.find(
    (generation) => !aggregate.representedGenerations.includes(generation),
  )
  if (missingGeneration !== undefined && candidates.length < 6) {
    const ordinal = RESEARCH_GENERATIONS.indexOf(missingGeneration) + 1
    const label = `Registrar una especie de la generación ${ordinal}`
    candidates.push({
      key: `generation-${ordinal}`,
      label,
      objective: createObjective(`generation-${ordinal}`, label, 1, 0, {
        kind: 'has-generation',
        generation: missingGeneration,
      }),
    })
  }
  return candidates.slice(0, 6)
}

export function buildExpedition(
  userId: string,
  entries: CollectionEntry[],
  now = new Date(),
): ResearchExpedition {
  const candidates = buildResearchCandidates(entries)
  const typeObjectives = candidates
    .filter((candidate) => candidate.objective.criterion.kind === 'has-type')
    .slice(0, 2)
  const selected = [candidates[0], ...typeObjectives].filter(
    (candidate): candidate is ExecutableCandidate => candidate !== undefined,
  )
  if (selected.length < 2 && candidates[1] !== undefined) {
    selected.push(candidates[1])
  }

  return {
    userId,
    title:
      typeObjectives.length > 0
        ? 'Cartografía de hábitats'
        : 'Ampliación del índice',
    premise:
      typeObjectives.length > 0
        ? 'Completa vacíos de tipos y amplía el registro con evidencia de tu colección.'
        : 'Amplía la diversidad de tu registro con nuevas especies.',
    status: 'active',
    baselineUnique: entries.length,
    objectives: selected.map((candidate) => candidate.objective),
    generation: { mode: 'rules', generatedAt: now },
    createdAt: now,
    updatedAt: now,
  }
}

function legacyCriterion(
  objective: StoredResearchObjective,
): ResearchCriterion {
  if (objective.criterion !== undefined) return objective.criterion
  if (objective.key.startsWith('type-')) {
    return { kind: 'has-type', type: objective.key.slice('type-'.length) }
  }
  const generationNumber = Number(objective.key.slice('generation-'.length))
  if (
    objective.key.startsWith('generation-') &&
    Number.isInteger(generationNumber) &&
    generationNumber >= 1 &&
    generationNumber <= RESEARCH_GENERATIONS.length
  ) {
    return {
      kind: 'has-generation',
      generation: RESEARCH_GENERATIONS[generationNumber - 1] as string,
    }
  }
  return { kind: 'unique-count' }
}

function normalizeExpedition(
  expedition: StoredResearchExpedition,
): ResearchExpedition {
  return {
    ...expedition,
    objectives: expedition.objectives.map((objective) => ({
      ...objective,
      criterion: legacyCriterion(objective),
    })),
    generation: expedition.generation ?? {
      mode: 'rules',
      generatedAt: expedition.createdAt,
    },
  }
}

export function updateExpeditionProgress(
  expedition: ResearchExpedition,
  entries: CollectionEntry[],
): ResearchExpedition {
  const objectives = expedition.objectives.map((objective) => {
    const criterion = objective.criterion
    let progress: number
    switch (criterion.kind) {
      case 'has-type':
        progress = entries.some((entry) =>
          entry.pokemon.types.includes(criterion.type),
        )
          ? 1
          : 0
        break
      case 'has-generation':
        progress = entries.some(
          (entry) => entry.pokemon.generation === criterion.generation,
        )
          ? 1
          : 0
        break
      case 'unique-count':
        progress = entries.length
        break
    }
    return { ...objective, progress, complete: progress >= objective.target }
  })
  return {
    ...expedition,
    objectives,
    status: objectives.every((objective) => objective.complete)
      ? 'completed'
      : 'active',
  }
}

function cleanExpedition(
  expedition: WithId<StoredResearchExpedition>,
): StoredResearchExpedition {
  const { _id: _ignored, ...value } = expedition
  return value
}

function buildKimiExpedition(
  userId: string,
  entries: CollectionEntry[],
  proposal: ResearchProposal,
  candidates: ExecutableCandidate[],
  now: Date,
): ResearchExpedition {
  const candidateByKey = new Map(
    candidates.map((candidate) => [candidate.key, candidate]),
  )
  const selectedKeys = proposal.objectiveKeys
  if (
    selectedKeys.length < 2 ||
    selectedKeys.length > 3 ||
    new Set(selectedKeys).size !== selectedKeys.length ||
    selectedKeys.some((key) => !candidateByKey.has(key))
  ) {
    throw new Error('Invalid verified research proposal')
  }

  return {
    userId,
    title: proposal.title,
    premise: proposal.premise,
    status: 'active',
    baselineUnique: entries.length,
    objectives: selectedKeys.map(
      (key) => (candidateByKey.get(key) as ExecutableCandidate).objective,
    ),
    generation: { mode: 'kimi', model: KIMI_MODEL, generatedAt: now },
    createdAt: now,
    updatedAt: now,
  }
}

export function createResearchService(database: Db) {
  const expeditions = database.collection<StoredResearchExpedition>(
    'research_expeditions',
  )

  async function current(userId: string, collectionEntries: CollectionEntry[]) {
    const record = await expeditions.findOne(
      { userId, 'generation.mode': 'kimi' },
      { sort: { updatedAt: -1 } },
    )
    if (record === null) return null

    const normalized = normalizeExpedition(cleanExpedition(record))
    return updateExpeditionProgress(normalized, collectionEntries)
  }

  async function generate(
    userId: string,
    collectionEntries: CollectionEntry[],
    proposalPort: ResearchProposalPort,
    now = new Date(),
    report?: (event: ResearchActivityEvent) => void | Promise<void>,
  ) {
    await report?.({ type: 'phase', phase: 'preparing' })
    const aggregate = analyzeResearchCollection(collectionEntries)
    const candidates = buildResearchCandidates(collectionEntries)
    await report?.({ type: 'phase', phase: 'generating' })
    const proposal = await proposalPort.propose({
      aggregate,
      candidates: candidates.map(({ key, label }) => ({ key, label })),
    })
    await report?.({ type: 'phase', phase: 'validating' })
    const expedition = buildKimiExpedition(
      userId,
      collectionEntries,
      proposal,
      candidates,
      now,
    )

    await report?.({ type: 'phase', phase: 'persisting' })
    const current = await expeditions.findOne({ userId, status: 'active' })
    if (current !== null) {
      const result = await expeditions.replaceOne(
        { _id: current._id, status: 'active' },
        expedition,
      )
      if (result.matchedCount === 1) return expedition
    }

    try {
      await expeditions.insertOne(expedition)
      return expedition
    } catch (error) {
      if (
        !(error instanceof Error && 'code' in error && error.code === 11000)
      ) {
        throw error
      }
      const concurrent = await expeditions.findOne({ userId, status: 'active' })
      if (concurrent === null) throw error
      const replaced = await expeditions.replaceOne(
        { _id: concurrent._id, status: 'active' },
        expedition,
      )
      if (replaced.matchedCount === 1) return expedition
      throw new Error('Research expedition write conflict')
    }
  }

  return { current, generate }
}

export function getResearchCapability(
  input: NodeJS.ProcessEnv = process.env,
): ResearchCapability {
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

async function getResearchDependencies() {
  const [database, collection] = await Promise.all([
    getMongoClient().connect(),
    getCollectionService(),
  ])
  return { database, collection }
}

export async function getCurrentResearch(userId: string) {
  const { database, collection } = await getResearchDependencies()
  const entries = await collection.list(userId)
  return createResearchService(database).current(userId, entries)
}

export async function getResearchResponse(
  userId: string,
): Promise<ResearchResponse> {
  return {
    expedition: await getCurrentResearch(userId),
    capability: getResearchCapability(),
  }
}

export async function generateResearchWithKimi(
  userId: string,
  report?: (event: ResearchActivityEvent) => void | Promise<void>,
) {
  await report?.({ type: 'phase', phase: 'collecting' })
  const { database, collection } = await getResearchDependencies()
  const entries = await collection.list(userId)
  return createResearchService(database).generate(
    userId,
    entries,
    createConfiguredKimiResearchAdapter(),
    new Date(),
    report,
  )
}
