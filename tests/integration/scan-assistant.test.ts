import { type Db, MongoClient } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { recognizeHandler } from '../../src/routes/api/ai/recognize'
import { assistantHandler } from '../../src/routes/api/assistant'
import {
  type AssistantActivityEvent,
  createAssistantService,
} from '../../src/server/assistant'
import { UnauthorizedError } from '../../src/server/auth'
import {
  createCardRecognitionService,
  type RecognitionCandidate,
} from '../../src/server/card-recognition'
import type { PokemonRecord } from '../../src/server/catalog'
import { createCollectionService } from '../../src/server/collection'
import {
  KimiAdapterError,
  type KimiChatPort,
} from '../../src/server/integrations/kimi'
import {
  createMcpToolClient,
  type McpPrincipal,
  type ReadonlyPortInput,
  type ReadonlyToolPort,
} from '../../src/server/integrations/mcp'

const mongoUri =
  process.env.MONGO_TEST_URI ??
  'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=2_000'
const databaseName = `pokedex_scan_assistant_${process.pid}_${Date.now()}`
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2_000 })
const baseUrl = 'http://127.0.0.1:3000'
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
let database: Db

function pokemon(): PokemonRecord {
  return {
    pokemonId: 25,
    name: 'pikachu',
    nameNormalized: 'pikachu',
    types: ['electric'],
    stats: [{ name: 'speed', value: 90 }],
    abilities: [{ name: 'static', hidden: false }],
    sprite: null,
    species: 'pikachu',
    genus: 'Mouse Pokémon',
    generation: 'generation-i',
    height: 4,
    weight: 60,
    sourceUpdatedAt: new Date('2026-01-01'),
    freshUntil: new Date('2027-01-01'),
  }
}

function candidate(): RecognitionCandidate {
  return {
    pokemonId: 25,
    name: 'pikachu',
    sprite: null,
    types: ['electric'],
    generation: 'generation-i',
    evidence: [
      { label: 'Identificación', value: '#25 pikachu', source: 'Kimi' },
      { label: 'Catálogo', value: 'pikachu', source: 'PokéAPI' },
    ],
  }
}

function imageRequest(stream = false, indication?: string) {
  const form = new FormData()
  form.set('image', new File([png], 'card.png', { type: 'image/png' }))
  form.set('consent', 'true')
  if (indication !== undefined) form.set('indication', indication)
  return new Request(`${baseUrl}/api/ai/recognize`, {
    method: 'POST',
    headers: stream ? { Accept: 'text/event-stream' } : undefined,
    body: form,
  })
}

const emptyStats = {
  totalUnique: 0,
  totalQuantity: 0,
  favorites: 0,
  typeDistribution: [],
  recent: [],
}

function createAssistantMcp(calls: ReadonlyPortInput[] = []) {
  const port: ReadonlyToolPort = {
    async list(input) {
      calls.push(input)
      let data: unknown
      switch (input.operation) {
        case 'search_pokemon':
          data = { items: [pokemon()], total: 1 }
          break
        case 'get_pokemon':
        case 'resource_pokemon':
          data = pokemon()
          break
        case 'list_my_collection':
        case 'resource_collection':
          data = []
          break
        case 'get_collection_stats':
        case 'resource_collection_stats':
          data = emptyStats
          break
        case 'compare_pokemon':
          data = [pokemon(), pokemon()]
          break
        case 'get_research_progress':
        case 'resource_research_active':
          data = {
            title: 'Investigación de prueba',
            objectives: [],
            generation: { mode: 'kimi', model: 'kimi-k2.6' },
          }
          break
      }
      return {
        operation: input.operation,
        subject: input.principal.subject,
        data,
      }
    },
  }
  return (principal: McpPrincipal) => createMcpToolClient(principal, port)
}

beforeAll(async () => {
  await client.connect()
  database = client.db(databaseName)
  await database
    .collection('collection_entries')
    .createIndex({ userId: 1, pokemonId: 1 }, { unique: true })
})

afterAll(async () => {
  await client.db(databaseName).dropDatabase()
  await client.close()
})

describe('protected recognition and confirmation boundary', () => {
  it('requires authentication before reading the upload', async () => {
    const response = await recognizeHandler(imageRequest(), {
      authenticate: async () => {
        throw new UnauthorizedError()
      },
    })
    expect(response.status).toBe(401)
  })

  it('returns a sanitized unavailable status without a live Kimi key', async () => {
    const previousEnabled = process.env.KIMI_LIVE_ENABLED
    const previousKey = process.env.MOONSHOT_API_KEY
    process.env.KIMI_LIVE_ENABLED = 'false'
    delete process.env.MOONSHOT_API_KEY
    try {
      const response = await recognizeHandler(imageRequest(), {
        authenticate: async () => ({ id: 'scan-user' }),
      })
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        status: 'unavailable',
        error: 'El reconocimiento visual no está disponible en este momento.',
      })
    } finally {
      if (previousEnabled === undefined) delete process.env.KIMI_LIVE_ENABLED
      else process.env.KIMI_LIVE_ENABLED = previousEnabled
      if (previousKey === undefined) delete process.env.MOONSHOT_API_KEY
      else process.env.MOONSHOT_API_KEY = previousKey
    }
  })

  it('does not persist uploads or write collection data before confirmation', async () => {
    const response = await recognizeHandler(imageRequest(), {
      authenticate: async () => ({ id: 'scan-user' }),
      recognize: vi.fn(async () => candidate()),
    })
    expect(response.status).toBe(200)
    expect(
      await database.collection('collection_entries').countDocuments(),
    ).toBe(0)
    expect(await database.collection('ai_analyses').countDocuments()).toBe(0)
    expect(await database.collection('messages').countDocuments()).toBe(0)

    await createCollectionService(database).add('scan-user', pokemon(), {
      pokemonId: 25,
      quantity: 1,
    })
    expect(
      await database
        .collection('collection_entries')
        .countDocuments({ userId: 'scan-user', pokemonId: 25 }),
    ).toBe(1)
  })

  it('passes an optional correction indication to the next recognition attempt', async () => {
    const recognize = vi.fn(async (input: { indication?: string }) => {
      expect(input.indication).toBe('La carta muestra un Pokémon de tipo agua.')
      return candidate()
    })
    const response = await recognizeHandler(
      imageRequest(false, 'La carta muestra un Pokémon de tipo agua.'),
      {
        authenticate: async () => ({ id: 'scan-correction-user' }),
        recognize,
      },
    )

    expect(response.status).toBe(200)
    expect(recognize).toHaveBeenCalledOnce()
  })

  it('adds the correction indication to Kimi without changing server verification', async () => {
    const analyzeImage = vi.fn(async () => ({
      pokemonId: 25,
      name: 'pikachu',
    }))
    const service = createCardRecognitionService({
      kimi: { analyzeImage },
      catalog: { getPokemon: vi.fn(async () => pokemon()) },
    })

    await expect(
      service.recognize({
        bytes: png,
        mediaType: 'image/png',
        indication: 'La carta muestra un Pokémon de tipo agua.',
      }),
    ).resolves.toMatchObject({ pokemonId: 25, name: 'pikachu' })
    expect(analyzeImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: expect.stringContaining(
          'La carta muestra un Pokémon de tipo agua.',
        ),
      }),
      expect.objectContaining({ onReasoning: expect.any(Function) }),
    )
  })

  it('streams Kimi visual reasoning without fabricated phases', async () => {
    const response = await recognizeHandler(imageRequest(true), {
      authenticate: async () => ({ id: 'scan-stream-user' }),
      recognize: async (_input, report) => {
        await report?.({
          type: 'reasoning',
          delta: 'La carta muestra rasgos visuales de Pikachu.',
        })
        return candidate()
      },
    })

    const body = await response.text()
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    expect(body).toContain('"type":"reasoning"')
    expect(body).toContain('rasgos visuales de Pikachu')
    expect(body).not.toContain('"type":"phase"')
    expect(body).toContain('"type":"complete"')
  })
})

describe('assistant ownership, persistence and no-key behavior', () => {
  it('persists owned conversations and messages with deterministic citations', async () => {
    delete process.env.MOONSHOT_API_KEY
    process.env.KIMI_LIVE_ENABLED = 'false'
    const calls: ReadonlyPortInput[] = []
    const service = createAssistantService(database, {
      connectMcp: createAssistantMcp(calls),
    })
    const sent = await service.send('owner-a', { message: '/stats' })

    expect(sent.message.content).toMatch(/0 especies.*0 ejemplares/i)
    expect(sent.message.citations).toHaveLength(1)
    expect(sent.message.toolCalls).toEqual([
      { name: 'get_collection_stats', input: {} },
    ])
    expect(calls).toContainEqual(
      expect.objectContaining({
        operation: 'get_collection_stats',
        principal: expect.objectContaining({ subject: 'owner-a' }),
      }),
    )
    expect((await service.history('owner-a')).conversations).toHaveLength(1)
    expect((await service.history('owner-b')).conversations).toEqual([])
    await expect(
      service.history('owner-b', { conversationId: sent.conversationId }),
    ).rejects.toMatchObject({ status: 404 })

    const history = await service.history('owner-a', {
      conversationId: sent.conversationId,
    })
    expect(history.messages).toHaveLength(2)
    expect(
      await database
        .collection('messages')
        .countDocuments({ userId: 'owner-a' }),
    ).toBe(2)
    expect(
      await database
        .collection('messages')
        .countDocuments({ userId: 'owner-b' }),
    ).toBe(0)
  })

  it('lets Kimi select a verified tool and persists its synthesized answer', async () => {
    const complete = vi
      .fn<KimiChatPort['complete']>()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [
          {
            id: 'get_collection_stats:0',
            name: 'get_collection_stats',
            arguments: '{}',
          },
        ],
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        content:
          'Tu colección está vacía; puedes comenzar desde el índice Pokédex. [1]',
        toolCalls: [],
      })
    const calls: ReadonlyPortInput[] = []
    const service = createAssistantService(database, {
      chat: { complete },
      connectMcp: createAssistantMcp(calls),
    })

    const sent = await service.send('owner-ai', {
      message: '¿Cómo puedo mejorar mi colección?',
    })

    expect(sent.message.content).toMatch(/colección está vacía/i)
    expect(sent.message.citations).toHaveLength(1)
    expect(sent.message.toolCalls).toEqual([
      { name: 'get_collection_stats', input: {} },
    ])
    expect(complete).toHaveBeenCalledTimes(2)
    expect(complete.mock.calls[0]?.[0].tools).toContainEqual(
      expect.objectContaining({
        function: expect.objectContaining({ name: 'get_collection_stats' }),
      }),
    )
    expect(complete.mock.calls[1]?.[0].messages).toContainEqual(
      expect.objectContaining({
        role: 'tool',
        name: 'get_collection_stats',
      }),
    )
    expect(calls).toContainEqual(
      expect.objectContaining({
        operation: 'get_collection_stats',
        principal: expect.objectContaining({ subject: 'owner-ai' }),
      }),
    )

    const history = await service.history('owner-ai', {
      conversationId: sent.conversationId,
    })
    expect(history.messages?.map((entry) => entry.role)).toEqual([
      'user',
      'assistant',
    ])
  })

  it('finishes a broad recommendation instead of exposing the tool budget', async () => {
    const complete = vi
      .fn<KimiChatPort['complete']>()
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [
          {
            id: 'stats:0',
            name: 'get_collection_stats',
            arguments: '{}',
          },
        ],
      })
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [
          {
            id: 'collection:0',
            name: 'list_my_collection',
            arguments: '{"limit":20}',
          },
          {
            id: 'search:0',
            name: 'search_pokemon',
            arguments: '{"query":"pikachu","limit":1}',
          },
        ],
      })
      .mockResolvedValueOnce({
        finishReason: 'tool_calls',
        content: '',
        toolCalls: [
          {
            id: 'pokemon:0',
            name: 'get_pokemon',
            arguments: '{"pokemonId":"pikachu"}',
          },
          {
            id: 'compare:0',
            name: 'compare_pokemon',
            arguments: '{"leftId":"pikachu","rightId":"raichu"}',
          },
          {
            id: 'research:0',
            name: 'get_research_progress',
            arguments: '{}',
          },
          {
            id: 'stats:1',
            name: 'get_collection_stats',
            arguments: '{}',
          },
        ],
      })
      .mockResolvedValueOnce({
        finishReason: 'stop',
        content:
          'Tu colección está vacía. Puedes comenzar con Pikachu y ampliar desde ahí. [1] [3]',
        toolCalls: [],
      })
    const calls: ReadonlyPortInput[] = []
    const service = createAssistantService(database, {
      chat: { complete },
      connectMcp: createAssistantMcp(calls),
    })

    const sent = await service.send('owner-recommendation', {
      message: 'Recomiéndame una colección',
    })

    expect(sent.message.content).toMatch(/puedes comenzar con Pikachu/i)
    expect(sent.message.toolCalls).toHaveLength(3)
    expect(sent.message.citations).toHaveLength(3)
    expect(calls).toHaveLength(3)
    expect(complete).toHaveBeenCalledTimes(4)
    expect(complete.mock.calls[3]?.[0].tools).toEqual([])
    expect(complete.mock.calls[3]?.[0].messages).toContainEqual(
      expect.objectContaining({
        role: 'system',
        content: expect.stringMatching(/presupuesto de herramientas/i),
      }),
    )
  })

  it('rejects oversized input before creating a conversation', async () => {
    const service = createAssistantService(database, {
      connectMcp: createAssistantMcp(),
    })
    await expect(
      service.send('limit-user', { message: 'x'.repeat(501) }),
    ).rejects.toBeDefined()
    expect(
      await database
        .collection('conversations')
        .countDocuments({ userId: 'limit-user' }),
    ).toBe(0)
  })

  it('keeps the endpoint protected', async () => {
    const response = await assistantHandler(
      new Request(`${baseUrl}/api/assistant`),
      {
        authenticate: async () => {
          throw new UnauthorizedError()
        },
      },
    )
    expect(response.status).toBe(401)
  })

  it('returns a sanitized unavailable response when live Kimi fails', async () => {
    const response = await assistantHandler(
      new Request(`${baseUrl}/api/assistant`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Ayúdame con mi colección' }),
      }),
      {
        authenticate: async () => ({ id: 'owner-provider-error' }),
        service: {
          history: vi.fn(),
          send: vi.fn(async () => {
            throw new KimiAdapterError('KIMI_HTTP_STATUS', 401)
          }),
        },
      },
    )

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({
      status: 'unavailable',
      error: 'El asistente con Kimi no está disponible en este momento.',
    })
  })

  it('streams Kimi reasoning, tool activity and the completed message', async () => {
    const response = await assistantHandler(
      new Request(`${baseUrl}/api/assistant`, {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: 'Resume mi colección' }),
      }),
      {
        authenticate: async () => ({ id: 'owner-stream' }),
        service: {
          history: vi.fn(),
          send: vi.fn(
            async (
              _userId: string,
              _input: unknown,
              report?: (event: AssistantActivityEvent) => void | Promise<void>,
            ) => {
              await report?.({
                type: 'reasoning',
                delta: 'Necesito consultar las estadísticas verificadas.',
              })
              await report?.({
                type: 'tool_call',
                operation: { name: 'get_collection_stats', input: {} },
              })
              await report?.({
                type: 'tool_result',
                operation: { name: 'get_collection_stats', input: {} },
                citations: [],
              })
              return {
                conversationId: '507f1f77bcf86cd799439011',
                message: {
                  id: '507f1f77bcf86cd799439012',
                  conversationId: '507f1f77bcf86cd799439011',
                  userId: 'owner-stream',
                  role: 'assistant' as const,
                  content: '**Resumen listo.**',
                  citations: [],
                  toolCalls: [
                    { name: 'get_collection_stats' as const, input: {} },
                  ],
                  createdAt: new Date('2026-08-14T14:00:00.000Z'),
                },
              }
            },
          ),
        },
      },
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/event-stream')
    const body = await response.text()
    expect(body).toContain('"type":"reasoning"')
    expect(body).toContain('estadísticas verificadas')
    expect(body).toContain('"type":"tool_call"')
    expect(body).toContain('"type":"tool_result"')
    expect(body).toContain('"type":"complete"')
    expect(body).toContain('**Resumen listo.**')
  })
})
