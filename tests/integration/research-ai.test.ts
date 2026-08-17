import { type Db, MongoClient } from 'mongodb'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

import { researchHandler } from '../../src/routes/api/research'
import type { CollectionEntry } from '../../src/server/collection'
import type { ResearchProposalPort } from '../../src/server/integrations/kimi'
import {
  buildExpedition,
  createResearchService,
  updateExpeditionProgress,
} from '../../src/server/research'

const mongoUri =
  process.env.MONGO_TEST_URI ??
  'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=2_000'
const databaseName = `pokedex_research_ai_${process.pid}_${Date.now()}`
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2_000 })
let database: Db

function entry(userId = 'research-user'): CollectionEntry {
  return {
    userId,
    pokemonId: 25,
    pokemon: {
      name: 'pikachu',
      sprite: null,
      types: ['electric'],
      generation: 'generation-i',
    },
    quantity: 1,
    nickname: null,
    notes: 'private raw note user@example.com',
    tags: ['private'],
    favorite: false,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  }
}

function validProposal(): ResearchProposalPort {
  return {
    propose: vi.fn(
      async () =>
        'Amplía el registro con especies que representen nuevos hábitats y descubre nuevas rutas para tu colección.',
    ),
  }
}

beforeAll(async () => {
  await client.connect()
  database = client.db(databaseName)
  await database.collection('research_expeditions').createIndex(
    { userId: 1 },
    {
      unique: true,
      partialFilterExpression: { status: 'active' },
      name: 'test_active_user_unique',
    },
  )
})

beforeEach(async () => {
  await database.collection('research_expeditions').deleteMany({})
})

afterAll(async () => {
  await database.dropDatabase()
  await client.close()
})

describe('AI research persistence boundary', () => {
  it('keeps research empty until the user explicitly generates with AI', async () => {
    const expedition = await createResearchService(database).current(
      'research-user',
      [entry()],
    )

    expect(expedition).toBeNull()
    expect(
      await database
        .collection('research_expeditions')
        .countDocuments({ userId: 'research-user' }),
    ).toBe(0)
  })

  it('persists verified Kimi provenance and server-owned executable criteria', async () => {
    const proposal = validProposal()
    const service = createResearchService(database)
    const expedition = await service.generate(
      'research-user',
      [entry()],
      proposal,
      new Date('2026-08-14T12:00:00Z'),
    )

    expect(expedition.generation).toEqual({
      mode: 'kimi',
      model: 'kimi-k2.6',
      generatedAt: new Date('2026-08-14T12:00:00Z'),
    })
    expect(expedition.narrative).toContain('Amplía el registro')
    expect(expedition.objectives).toEqual([
      expect.objectContaining({
        key: 'expand-index',
        target: 4,
        progress: 1,
        criterion: { kind: 'unique-count' },
      }),
      expect.objectContaining({
        key: 'type-fire',
        target: 1,
        progress: 0,
        criterion: { kind: 'has-type', type: 'fire' },
      }),
      expect.objectContaining({
        key: 'type-water',
        target: 1,
        progress: 0,
        criterion: { kind: 'has-type', type: 'water' },
      }),
    ])
    expect(JSON.stringify(expedition)).not.toContain('private raw note')
    expect(proposal.propose).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregate: expect.objectContaining({ uniqueCount: 1 }),
      }),
      expect.objectContaining({ onReasoning: expect.any(Function) }),
    )
    expect(
      JSON.stringify(vi.mocked(proposal.propose).mock.calls),
    ).not.toContain('private raw note')
  })

  it('does not persist invalid output and preserves an existing active record', async () => {
    const service = createResearchService(database)
    const original = buildExpedition('research-user', [entry()])
    await database.collection('research_expeditions').insertOne(original)
    const proposal: ResearchProposalPort = {
      propose: vi.fn(async () => {
        throw new Error('invalid provider output')
      }),
    }

    await expect(
      service.generate('research-user', [entry()], proposal),
    ).rejects.toThrow('invalid provider output')
    const records = await database
      .collection('research_expeditions')
      .find({ userId: 'research-user' })
      .toArray()
    expect(records).toHaveLength(1)
    expect(records[0]?.title).toBe(original.title)
    expect(records[0]?.generation).toEqual(original.generation)
  })

  it('leaves persistence empty when an initial proposal fails', async () => {
    const proposal: ResearchProposalPort = {
      propose: vi.fn(async () => {
        throw new Error('malformed provider response')
      }),
    }

    await expect(
      createResearchService(database).generate(
        'research-user',
        [entry()],
        proposal,
      ),
    ).rejects.toThrow('malformed provider response')
    expect(
      await database
        .collection('research_expeditions')
        .countDocuments({ userId: 'research-user' }),
    ).toBe(0)
  })

  it('does not surface a legacy rules expedition as AI research', async () => {
    const legacy = buildExpedition('research-user', [entry()])
    const { generation: _generation, ...untagged } = legacy
    await database.collection('research_expeditions').insertOne(untagged)

    const surfaced = await createResearchService(database).current(
      'research-user',
      [entry()],
    )
    expect(surfaced).toBeNull()
    await expect(
      database.collection('research_expeditions').findOne({
        userId: 'research-user',
      }),
    ).resolves.not.toBeNull()
  })

  it('keeps deterministic progress idempotent', () => {
    const expedition = buildExpedition('research-user', [entry()])
    const first = updateExpeditionProgress(expedition, [entry()])
    const second = updateExpeditionProgress(first, [entry()])
    expect(second).toEqual(first)
  })

  it('keeps the latest completed Kimi expedition visible', async () => {
    const service = createResearchService(database)
    await service.generate(
      'research-user',
      [entry()],
      validProposal(),
      new Date('2026-08-14T12:00:00Z'),
    )
    const completedEntries = [
      entry(),
      ...[7, 8, 9].map((pokemonId) => ({
        ...entry(),
        pokemonId,
        pokemon: {
          ...entry().pokemon,
          types:
            pokemonId === 7
              ? ['water']
              : pokemonId === 8
                ? ['fire']
                : ['electric'],
        },
      })),
    ]

    await expect(
      service.current('research-user', completedEntries),
    ).resolves.toMatchObject({ status: 'completed' })
    await expect(
      service.current('research-user', completedEntries),
    ).resolves.toMatchObject({ status: 'completed' })
    await expect(
      database.collection('research_expeditions').findOne({
        userId: 'research-user',
      }),
    ).resolves.toMatchObject({ status: 'active' })
  })
})

describe('research API capability boundary', () => {
  it('streams Kimi reasoning before completion', async () => {
    const response = await researchHandler(
      new Request('http://localhost/api/research', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
      }),
      {
        authenticate: async () => ({ id: 'research-stream-user' }),
        capability: () => true,
        generate: async (_userId, report) => {
          await report?.({
            type: 'reasoning',
            delta: 'Conviene ampliar los tipos ausentes.',
          })
          return {
            ...buildExpedition('research-stream-user', []),
            generation: {
              mode: 'kimi' as const,
              model: 'kimi-k2.6' as const,
              generatedAt: new Date('2026-08-14T12:00:00Z'),
            },
          }
        },
      },
    )

    const body = await response.text()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(body).toContain('"type":"reasoning"')
    expect(body).toContain('tipos ausentes')
    expect(body).not.toContain('"type":"phase"')
    expect(body).toContain('"type":"complete"')
  })

  it('returns a sanitized 503 for POST when Kimi is disabled', async () => {
    const response = await researchHandler(
      new Request('http://localhost/api/research', { method: 'POST' }),
      {
        authenticate: async () => ({ id: 'research-user' }),
        capability: () => false,
      },
    )
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      status: 'unavailable',
      error: 'La generación con Kimi no está disponible en este momento.',
    })
  })
})
