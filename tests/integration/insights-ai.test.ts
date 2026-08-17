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

import { insightsHandler } from '../../src/routes/api/insights'
import type { CollectionEntry } from '../../src/server/collection'
import { createInsightsService } from '../../src/server/insights'
import type { InsightsProposalPort } from '../../src/server/integrations/kimi'

const mongoUri =
  process.env.MONGO_TEST_URI ??
  'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=2_000'
const databaseName = `pokedex_insights_ai_${process.pid}_${Date.now()}`
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2_000 })
let database: Db

function entry(overrides: Partial<CollectionEntry> = {}): CollectionEntry {
  return {
    userId: 'insights-user',
    pokemonId: 25,
    pokemon: {
      name: 'pikachu',
      sprite: null,
      types: ['electric'],
      generation: 'generation-i',
    },
    quantity: 2,
    nickname: null,
    notes: 'private raw note',
    tags: [],
    favorite: false,
    createdAt: new Date('2026-08-14T10:00:00Z'),
    updatedAt: new Date('2026-08-14T10:00:00Z'),
    ...overrides,
  }
}

function proposal(): InsightsProposalPort {
  return {
    propose: vi.fn(
      async () =>
        'La colección es compacta y su concentración eléctrica puede convertirse en una oportunidad para sumar diversidad sin perder claridad sobre cada registro.',
    ),
  }
}

beforeAll(async () => {
  await client.connect()
  database = client.db(databaseName)
  await database
    .collection('ai_insights')
    .createIndex({ userId: 1, type: 1, collectionVersion: 1 }, { unique: true })
})

beforeEach(async () => {
  await database.collection('ai_insights').deleteMany({})
})

afterAll(async () => {
  await database.dropDatabase()
  await client.close()
})

describe('grounded AI insights', () => {
  it('persists freeform interpretation alongside deterministic evidence', async () => {
    const entries = [entry()]
    const generatedBy = proposal()
    const service = createInsightsService(database, {
      collection: { list: vi.fn(async () => entries) },
      now: () => new Date('2026-08-14T12:00:00Z'),
    })

    const generated = await service.generate('insights-user', generatedBy)

    expect(generated.model).toBe('kimi-k2.6')
    expect(generated.narrative).toContain('La colección es compacta')
    expect(generated.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'collection-size',
          fact: '1 especie y 2 ejemplares.',
        }),
        expect.objectContaining({
          key: 'type-distribution',
          fact: expect.stringContaining('electric (2)'),
        }),
      ]),
    )
    expect(
      JSON.stringify(vi.mocked(generatedBy.propose).mock.calls),
    ).not.toContain('private raw note')
    await expect(service.current('insights-user')).resolves.toMatchObject({
      analysis: expect.objectContaining({ narrative: generated.narrative }),
    })
  })

  it('invalidates the cached analysis when collection facts change', async () => {
    let entries = [entry()]
    const service = createInsightsService(database, {
      collection: { list: vi.fn(async () => entries) },
    })
    await service.generate('insights-user', proposal())
    entries = [entry({ quantity: 3 })]

    await expect(service.current('insights-user')).resolves.toMatchObject({
      analysis: null,
      stats: { totalQuantity: 3 },
    })
  })

  it('streams Kimi reasoning and completion', async () => {
    const response = await insightsHandler(
      new Request('http://localhost/api/insights', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
      }),
      {
        authenticate: async () => ({ id: 'insights-stream-user' }),
        capability: () => true,
        generate: async (_userId, report) => {
          await report?.({
            type: 'reasoning',
            delta: 'La distribución muestra una colección concentrada.',
          })
          return {
            userId: 'insights-stream-user',
            type: 'collection-overview',
            collectionVersion: 'version',
            narrative:
              'Una lectura narrativa de la colección con suficiente contenido.',
            evidence: [],
            model: 'kimi-k2.6',
            createdAt: new Date('2026-08-14T12:00:00Z'),
          }
        },
      },
    )

    const body = await response.text()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(body).toContain('"type":"reasoning"')
    expect(body).toContain('colección concentrada')
    expect(body).not.toContain('"type":"phase"')
    expect(body).toContain('"type":"complete"')
  })
})
