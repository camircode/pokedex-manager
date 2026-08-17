import { once } from 'node:events'
import { readdirSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  createConfiguredKimiAdapter,
  createKimiAdapter,
  createKimiChatAdapter,
  createKimiInsightsAdapter,
  createKimiResearchAdapter,
  KIMI_MODEL,
  KIMI_RESPONSE_FORMAT,
  KIMI_THINKING,
  KimiAdapterError,
  loadKimiConfig,
} from '../../src/server/integrations/kimi'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const fixturePath = resolve(projectRoot, 'tests/fixtures/kimi/pokemon-card.svg')
const fixtureBytes = readFileSync(fixturePath)

type CapturedRequest = {
  model: string
  messages: Array<{
    role: string
    content:
      | string
      | Array<
          | { type: 'image_url'; image_url: { url: string } }
          | { type: 'text'; text: string }
        >
    tool_calls?: unknown
    name?: string
    tool_call_id?: string
  }>
  response_format?: unknown
  tools?: Array<{ type: string; function: { name: string } }>
  tool_choice?: { type: string; function: { name: string } }
  stream: boolean
  thinking?: { type: string }
  temperature?: number
  max_completion_tokens?: number
}

type MockReply = {
  status?: number
  payload?: unknown
  raw?: string
  delayMs?: number
}

type MockKimiServer = {
  baseUrl: string
  requests: CapturedRequest[]
  authorizationHeaders: string[]
  close: () => Promise<void>
}

async function startMockKimiServer(
  reply: MockReply | ((request: CapturedRequest) => MockReply),
): Promise<MockKimiServer> {
  const requests: CapturedRequest[] = []
  const authorizationHeaders: string[] = []
  const server = createServer((request, response) => {
    let body = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => {
      body += chunk
    })
    request.on('end', () => {
      const captured = JSON.parse(body) as CapturedRequest
      requests.push(captured)
      authorizationHeaders.push(
        typeof request.headers.authorization === 'string'
          ? request.headers.authorization
          : '',
      )
      const result = typeof reply === 'function' ? reply(captured) : reply
      const sendResponse = () => {
        response.statusCode = result.status ?? 200
        const payload = (result.payload ?? {
          choices: [
            {
              finish_reason: 'stop',
              message: {
                content: JSON.stringify({ pokemonId: 25, name: 'pikachu' }),
              },
            },
          ],
        }) as {
          choices?: Array<{
            finish_reason?: string
            message?: {
              content?: string
              reasoning_content?: string
              tool_calls?: Array<Record<string, unknown>>
            }
          }>
        }
        if (captured.stream && result.status === undefined) {
          response.setHeader('content-type', 'text/event-stream')
          if (result.raw !== undefined) {
            response.end(result.raw)
            return
          }
          const choices = (payload.choices ?? []).map((choice) => ({
            finish_reason: choice.finish_reason ?? null,
            delta: {
              content: choice.message?.content,
              reasoning_content: choice.message?.reasoning_content,
              tool_calls: choice.message?.tool_calls?.map(
                (toolCall, index) => ({
                  index,
                  ...toolCall,
                }),
              ),
            },
          }))
          response.end(
            `data: ${JSON.stringify({ choices })}\n\ndata: [DONE]\n\n`,
          )
          return
        }
        response.setHeader('content-type', 'application/json')
        response.end(result.raw ?? JSON.stringify(payload))
      }

      if (result.delayMs === undefined) sendResponse()
      else setTimeout(sendResponse, result.delayMs)
    })
  })

  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (address === null || typeof address === 'string') {
    await new Promise<void>((resolveClose) =>
      server.close(() => resolveClose()),
    )
    throw new Error('Mock Kimi server did not expose a TCP address')
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests,
    authorizationHeaders,
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => {
          if (error === undefined) resolveClose()
          else rejectClose(error)
        })
      }),
  }
}

async function analyzeWithMock(reply: MockReply) {
  const server = await startMockKimiServer(reply)
  try {
    const adapter = createKimiAdapter({
      apiKey: 'deterministic-contract-key',
      baseUrl: server.baseUrl,
    })
    const result = await adapter.analyzeImage({
      image: fixtureBytes,
      mediaType: 'image/svg+xml',
      prompt: 'Identify this Pokémon.',
    })
    return { result, server }
  } catch (error) {
    return { error, server }
  }
}

describe('Kimi direct adapter contract', () => {
  it('builds the documented multimodal request and accepts a valid result', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({ pokemonId: 25, name: 'Pikachu' }),
            },
          },
        ],
      },
    })

    try {
      const adapter = createKimiAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      const result = await adapter.analyzeImage({
        image: fixtureBytes,
        mediaType: 'image/svg+xml',
        prompt: 'Identify this Pokémon.',
      })

      expect(result).toEqual({ pokemonId: 25, name: 'pikachu' })
      const request = server.requests[0]
      expect(request).toBeDefined()
      if (request === undefined)
        throw new Error('Mock request was not captured')

      expect(request.model).toBe(KIMI_MODEL)
      expect(server.authorizationHeaders[0]).toBe(
        'Bearer deterministic-contract-key',
      )
      expect(request.stream).toBe(true)
      expect(request.thinking).toEqual(KIMI_THINKING)
      expect(request.temperature).toBeUndefined()
      expect(request.max_completion_tokens).toBeUndefined()
      expect(request.messages).toHaveLength(2)
      expect(request.messages[0]?.role).toBe('system')
      expect(request.messages[0]?.content).toEqual(expect.any(String))
      expect(request.messages[0]?.content).toContain(
        '{"pokemonId":151,"name":"mew"}',
      )
      expect(request.messages[0]?.content).toContain('National Pokédex')
      expect(request.messages[0]?.content).toContain('base-species slug')
      expect(request.messages[0]?.content).toContain('ex, EX, GX, V')
      expect(request.messages[1]?.role).toBe('user')
      const content = request.messages[1]?.content
      expect(Array.isArray(content) ? content[1] : undefined).toEqual({
        type: 'text',
        text: 'Identify this Pokémon.',
      })

      const imagePart = Array.isArray(content) ? content[0] : undefined
      expect(imagePart).toEqual({
        type: 'image_url',
        image_url: {
          url: `data:image/svg+xml;base64,${fixtureBytes.toString('base64')}`,
        },
      })
      expect(JSON.stringify(request)).not.toContain(
        'deterministic-contract-key',
      )
      expect(request.response_format).toEqual(KIMI_RESPONSE_FORMAT)
    } finally {
      await server.close()
    }
  })

  it('forces visual identification through the provided MCP tool', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              reasoning_content: 'The card title identifies the base species.',
              content: '',
              tool_calls: [
                {
                  id: 'call-1',
                  type: 'function',
                  function: {
                    name: 'get_pokemon',
                    arguments: JSON.stringify({ pokemonId: 151 }),
                  },
                },
              ],
            },
          },
        ],
      },
    })
    const reasoning: string[] = []

    try {
      const result = await createKimiAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      }).analyzeImageWithTool(
        {
          image: fixtureBytes,
          mediaType: 'image/svg+xml',
          prompt: 'Identify this Pokémon.',
        },
        {
          type: 'function',
          function: {
            name: 'get_pokemon',
            description: 'Verified PokéAPI-backed Pokémon details.',
            parameters: { type: 'object' },
          },
        },
        {
          onReasoning: (delta) => {
            reasoning.push(delta)
          },
        },
      )

      expect(result).toEqual({
        id: 'call-1',
        name: 'get_pokemon',
        arguments: JSON.stringify({ pokemonId: 151 }),
      })
      expect(reasoning.join('')).toContain('base species')
      const request = server.requests[0]
      expect(request?.tools?.[0]?.function.name).toBe('get_pokemon')
      expect(request?.tool_choice).toBeUndefined()
      expect(request?.response_format).toBeUndefined()
      expect(request?.thinking).toEqual(KIMI_THINKING)
      expect(request?.max_completion_tokens).toBeUndefined()
      expect(request?.messages[0]?.content).toContain(
        'tool result is the authoritative answer',
      )
    } finally {
      await server.close()
    }
  })

  it('forwards Kimi reasoning_content as it streams', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              reasoning_content: 'La silueta y la cola coinciden con Pikachu.',
              content: JSON.stringify({ pokemonId: 25, name: 'pikachu' }),
            },
          },
        ],
      },
    })
    const reasoning: string[] = []

    try {
      const adapter = createKimiAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      await adapter.analyzeImage(
        { image: fixtureBytes, mediaType: 'image/svg+xml' },
        {
          onReasoning: (delta) => {
            reasoning.push(delta)
          },
        },
      )

      expect(reasoning.join('')).toBe(
        'La silueta y la cola coinciden con Pikachu.',
      )
    } finally {
      await server.close()
    }
  })

  it('sends only aggregate signals and candidate keys in a text-only research request', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content:
                'Tu colección puede abrir una ruta hacia nuevos hábitats: amplía el registro con especies de tipos todavía ausentes y conserva una curaduría manejable.',
            },
          },
        ],
      },
    })

    try {
      const adapter = createKimiResearchAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      await expect(
        adapter.propose({
          aggregate: {
            uniqueCount: 1,
            representedTypes: ['electric'],
            missingTypes: ['fire', 'water'],
            representedGenerations: ['generation-i'],
          },
          candidates: [
            { key: 'expand-index', label: 'Registrar tres especies nuevas' },
            {
              key: 'type-water',
              label: 'Registrar una especie de tipo agua',
            },
          ],
        }),
      ).resolves.toContain('Tu colección puede abrir una ruta')

      const request = server.requests[0]
      expect(request?.model).toBe('kimi-k2.6')
      expect(request?.stream).toBe(true)
      expect(request?.thinking).toEqual(KIMI_THINKING)
      expect(request?.temperature).toBeUndefined()
      expect(request?.max_completion_tokens).toBeUndefined()
      expect(request?.response_format).toBeUndefined()
      expect(typeof request?.messages[0]?.content).toBe('string')
      const prompt = request?.messages[0]?.content
      expect(prompt).toContain('español claro, cotidiano y fácil de entender')
      expect(prompt).toContain('dos párrafos cortos')
      expect(prompt).toContain('Evita el tono académico')
      expect(prompt).toContain('Menciona como máximo tres tipos ausentes')
      expect(prompt).not.toContain('con libertad para desarrollar la idea')
      const serialized = JSON.stringify(request)
      expect(serialized).not.toContain('user@example.com')
      expect(serialized).not.toContain('private raw note')
      expect(serialized).not.toContain('userId')
    } finally {
      await server.close()
    }
  })

  it('grounds collection insights in allowlisted deterministic facts', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content:
                'La colección tiene una base compacta y señales claras para orientar su próxima ampliación. La concentración actual puede convertirse en una oportunidad para explorar nuevos tipos sin perder una curaduría manejable.',
            },
          },
        ],
      },
    })

    try {
      const adapter = createKimiInsightsAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      await expect(
        adapter.propose({
          facts: [
            {
              key: 'collection-size',
              label: 'Tamaño',
              fact: '2 especies y 2 ejemplares.',
            },
            {
              key: 'favorites',
              label: 'Curaduría',
              fact: '0 especies favoritas.',
            },
          ],
        }),
      ).resolves.toContain('La colección tiene una base compacta')
      expect(server.requests[0]?.thinking).toEqual(KIMI_THINKING)
      expect(server.requests[0]?.temperature).toBeUndefined()
      expect(server.requests[0]?.max_completion_tokens).toBeUndefined()
      expect(server.requests[0]?.response_format).toBeUndefined()
    } finally {
      await server.close()
    }
  })

  it('accepts documented assistant tool calls without executing them in the adapter', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: '',
              tool_calls: [
                {
                  id: 'getCollectionStats:0',
                  type: 'function',
                  function: {
                    name: 'getCollectionStats',
                    arguments: '{}',
                  },
                },
              ],
            },
          },
        ],
      },
    })

    try {
      const adapter = createKimiChatAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      await expect(
        adapter.complete({
          messages: [
            { role: 'system', content: 'Use verified tools.' },
            { role: 'user', content: '¿Cómo está mi colección?' },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'getCollectionStats',
                description: 'Read collection statistics.',
                parameters: {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
                },
              },
            },
          ],
        }),
      ).resolves.toEqual({
        finishReason: 'tool_calls',
        content: '',
        reasoningContent: '',
        toolCalls: [
          {
            id: 'getCollectionStats:0',
            name: 'getCollectionStats',
            arguments: '{}',
          },
        ],
      })
      expect(server.requests[0]?.model).toBe(KIMI_MODEL)
      expect(server.requests[0]?.response_format).toBeUndefined()
      expect(server.requests[0]?.tools?.[0]?.function.name).toBe(
        'getCollectionStats',
      )
      expect(server.requests[0]?.max_completion_tokens).toBeUndefined()
      expect(server.requests[0]?.thinking).toEqual(KIMI_THINKING)
      expect(server.requests[0]?.temperature).toBeUndefined()
    } finally {
      await server.close()
    }
  })

  it('submits tool results back to Kimi for the final conversational answer', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: 'Tu colección tiene 3 especies verificadas. [1]',
            },
          },
        ],
      },
    })

    try {
      const adapter = createKimiChatAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      await expect(
        adapter.complete({
          messages: [
            { role: 'system', content: 'Use verified tools.' },
            { role: 'user', content: '¿Cómo está mi colección?' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  id: 'getCollectionStats:0',
                  name: 'getCollectionStats',
                  arguments: '{}',
                },
              ],
            },
            {
              role: 'tool',
              toolCallId: 'getCollectionStats:0',
              name: 'getCollectionStats',
              content: '{"answer":"3 especies [1]"}',
            },
          ],
          tools: [
            {
              type: 'function',
              function: {
                name: 'getCollectionStats',
                description: 'Read collection statistics.',
                parameters: {
                  type: 'object',
                  properties: {},
                  additionalProperties: false,
                },
              },
            },
          ],
        }),
      ).resolves.toMatchObject({
        finishReason: 'stop',
        content: 'Tu colección tiene 3 especies verificadas. [1]',
      })
      expect(server.requests[0]?.messages[2]?.tool_calls).toBeDefined()
      expect(server.requests[0]?.messages[3]).toMatchObject({
        role: 'tool',
        name: 'getCollectionStats',
        tool_call_id: 'getCollectionStats:0',
      })
    } finally {
      await server.close()
    }
  })

  it('allows a tool-free final synthesis after the assistant reaches its budget', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'Respuesta final con datos verificados. [1]' },
          },
        ],
      },
    })

    try {
      const adapter = createKimiChatAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      await expect(
        adapter.complete({
          messages: [
            { role: 'system', content: 'Use only verified results.' },
            { role: 'user', content: 'Recomiéndame una colección.' },
          ],
          tools: [],
        }),
      ).resolves.toMatchObject({ finishReason: 'stop' })
      expect(server.requests[0]?.tools).toBeUndefined()
    } finally {
      await server.close()
    }
  })

  it('accepts a freeform research narrative without a response schema', async () => {
    const server = await startMockKimiServer({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content:
                'Explora una nueva frontera de tu colección y registra especies que amplíen su diversidad.',
            },
          },
        ],
      },
    })
    try {
      const adapter = createKimiResearchAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      await expect(
        adapter.propose({
          aggregate: {
            uniqueCount: 0,
            representedTypes: [],
            missingTypes: ['fire', 'water'],
            representedGenerations: [],
          },
          candidates: [
            { key: 'expand-index', label: 'Registrar tres especies nuevas' },
            {
              key: 'type-water',
              label: 'Registrar una especie de tipo agua',
            },
          ],
        }),
      ).resolves.toContain('Explora una nueva frontera')
      expect(server.requests[0]?.response_format).toBeUndefined()
    } finally {
      await server.close()
    }
  })

  it.each([
    ['length', '{"title":"Archivo'],
    ['stop', 'too short'],
  ])(
    'rejects research finish reason %s with invalid narrative content',
    async (finishReason, content) => {
      const server = await startMockKimiServer({
        payload: {
          choices: [{ finish_reason: finishReason, message: { content } }],
        },
      })
      try {
        const adapter = createKimiResearchAdapter({
          apiKey: 'deterministic-contract-key',
          baseUrl: server.baseUrl,
        })
        await expect(
          adapter.propose({
            aggregate: {
              uniqueCount: 0,
              representedTypes: [],
              missingTypes: ['fire', 'water'],
              representedGenerations: [],
            },
            candidates: [
              { key: 'expand-index', label: 'Registrar tres especies nuevas' },
              {
                key: 'type-water',
                label: 'Registrar una especie de tipo agua',
              },
            ],
          }),
        ).rejects.toMatchObject({
          code:
            finishReason === 'length'
              ? 'KIMI_RESPONSE_TRUNCATED'
              : 'KIMI_RESULT_INVALID',
        })
      } finally {
        await server.close()
      }
    },
  )

  it('rejects non-200 provider responses without exposing provider content', async () => {
    const { error, server } = await analyzeWithMock({
      status: 503,
      payload: { error: { message: 'provider-key-should-not-leak' } },
    })

    try {
      expect(error).toBeInstanceOf(KimiAdapterError)
      expect(error).toMatchObject({ code: 'KIMI_HTTP_STATUS', status: 503 })
      expect((error as Error).message).not.toContain(
        'provider-key-should-not-leak',
      )
    } finally {
      await server.close()
    }
  })

  it('rejects truncation before parsing a partial JSON document', async () => {
    const { error, server } = await analyzeWithMock({
      payload: {
        choices: [
          {
            finish_reason: 'length',
            message: { content: '{"pokemonId":25' },
          },
        ],
      },
    })

    try {
      expect(error).toMatchObject({ code: 'KIMI_RESPONSE_TRUNCATED' })
    } finally {
      await server.close()
    }
  })

  it('rejects malformed JSON after a complete provider response', async () => {
    const { error, server } = await analyzeWithMock({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: { content: 'not-json' },
          },
        ],
      },
    })

    try {
      expect(error).toMatchObject({ code: 'KIMI_JSON_INVALID' })
    } finally {
      await server.close()
    }
  })

  it('normalizes provider display names before catalog verification', async () => {
    const { result, server } = await analyzeWithMock({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: {
              content: JSON.stringify({ pokemonId: 122, name: 'Mr. Mime' }),
            },
          },
        ],
      },
    })

    try {
      expect(result).toEqual({ pokemonId: 122, name: 'mr-mime' })
    } finally {
      await server.close()
    }
  })

  it.each([
    ['zero identifier', { pokemonId: 0, name: 'pikachu' }],
    ['fractional identifier', { pokemonId: 25.5, name: 'pikachu' }],
    ['extra unsafe field', { pokemonId: 25, name: 'pikachu', unsafe: true }],
  ])('rejects %s through the Zod domain boundary', async (_label, content) => {
    const { error, server } = await analyzeWithMock({
      payload: {
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(content) },
          },
        ],
      },
    })

    try {
      expect(error).toMatchObject({ code: 'KIMI_RESULT_INVALID' })
    } finally {
      await server.close()
    }
  })

  it('waits for a delayed provider response without an application deadline', async () => {
    const delayedAttempt = await analyzeWithMock({ delayMs: 150 })
    try {
      expect(delayedAttempt.result).toEqual({ pokemonId: 25, name: 'pikachu' })
    } finally {
      await delayedAttempt.server.close()
    }
  })

  it('still honors an explicit caller AbortSignal', async () => {
    const server = await startMockKimiServer({
      delayMs: 100,
      payload: { choices: [] },
    })
    try {
      const adapter = createKimiAdapter({
        apiKey: 'deterministic-contract-key',
        baseUrl: server.baseUrl,
      })
      const controller = new AbortController()
      const request = adapter.analyzeImage(
        { image: fixtureBytes, mediaType: 'image/svg+xml' },
        { signal: controller.signal },
      )
      controller.abort()
      await expect(request).rejects.toMatchObject({ code: 'KIMI_ABORTED' })
    } finally {
      await server.close()
    }
  })

  it('keeps Kimi modules server-only and free of Mongo imports or writes', () => {
    const integrationDirectory = resolve(projectRoot, 'src/server/integrations')
    const kimiModules = readdirSync(integrationDirectory).filter(
      (file) => file.startsWith('kimi') && file.endsWith('.ts'),
    )

    expect(kimiModules.length).toBeGreaterThan(0)
    for (const file of kimiModules) {
      const source = readFileSync(resolve(integrationDirectory, file), 'utf8')
      expect(source).toContain("import '@tanstack/react-start/server-only'")
      expect(source).not.toMatch(
        /from\s+['"][^'"]*(?:mongodb|\/db\/)[^'"]*['"]/i,
      )
      expect(source).not.toMatch(
        /\b(?:MongoClient|Db|createIndex|listIndexes|insertOne|insertMany|updateOne|updateMany|deleteOne|deleteMany|replaceOne|findOneAndUpdate|findOneAndReplace|findOneAndDelete|createCollection|dropDatabase|drop)\b/,
      )
      expect(source).not.toMatch(/console\.(?:log|info|warn|error)\s*\(/)
    }
  })

  it('requires an explicit live flag and API key, while keeping live opt-in', () => {
    expect(loadKimiConfig({})).toEqual({ enabled: false, apiKey: undefined })
    expect(() => loadKimiConfig({ KIMI_LIVE_ENABLED: 'true' })).toThrowError(
      KimiAdapterError,
    )
    expect(
      loadKimiConfig({
        KIMI_LIVE_ENABLED: 'true',
        MOONSHOT_API_KEY: 'deterministic-config-key',
      }),
    ).toMatchObject({
      enabled: true,
      apiKey: 'deterministic-config-key',
    })
    expect(() =>
      createConfiguredKimiAdapter({ KIMI_LIVE_ENABLED: 'false' }),
    ).toThrowError(KimiAdapterError)
  })

  const liveOptIn =
    process.env.KIMI_LIVE_ENABLED === 'true' &&
    typeof process.env.MOONSHOT_API_KEY === 'string' &&
    process.env.MOONSHOT_API_KEY.length > 0

  it.skipIf(!liveOptIn)(
    'runs the direct live contract only when explicitly enabled',
    async () => {
      const adapter = createConfiguredKimiAdapter()
      const result = await adapter.analyzeImage({
        image: fixtureBytes,
        mediaType: 'image/svg+xml',
        prompt: 'Identify this Pokémon.',
      })

      expect(result.pokemonId).toBeGreaterThan(0)
      expect(result.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    },
  )

  it.skipIf(!liveOptIn)(
    'streams live Kimi reasoning for a narrative request',
    async () => {
      const reasoning: string[] = []
      const adapter = createKimiInsightsAdapter({
        apiKey: process.env.MOONSHOT_API_KEY ?? '',
      })
      const narrative = await adapter.propose(
        {
          facts: [
            {
              key: 'collection-size',
              label: 'Tamaño',
              fact: '1 especie y 1 ejemplar.',
            },
            {
              key: 'favorites',
              label: 'Curaduría',
              fact: '0 especies favoritas.',
            },
          ],
        },
        {
          onReasoning: (delta) => {
            reasoning.push(delta)
          },
        },
      )

      expect(reasoning.join('').length).toBeGreaterThan(0)
      expect(narrative.length).toBeGreaterThanOrEqual(20)
    },
    120_000,
  )
})
