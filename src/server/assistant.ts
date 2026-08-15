import '@tanstack/react-start/server-only'

import { type Db, ObjectId, type WithId } from 'mongodb'
import { z } from 'zod'

import {
  createConfiguredKimiChatAdapter,
  KIMI_MODEL,
  KimiAdapterError,
  type KimiChatMessage,
  type KimiChatPort,
  type KimiChatTool,
  type KimiToolCall,
  loadKimiConfig,
} from '@/server/integrations/kimi'
import {
  createMcpToolClient,
  MCP_TOOL_NAMES,
  McpClientError,
  type McpPrincipal,
  type McpToolClient,
  type McpToolName,
} from '@/server/integrations/mcp'

export const MAX_ASSISTANT_TOOL_OPERATIONS = 6
const MAX_ASSISTANT_CONTEXT_MESSAGES = 20

const ASSISTANT_SYSTEM_PROMPT = [
  'Eres el asistente de colección de Pokédex Manager.',
  'Responde en español neutral de forma clara, breve y útil.',
  'Usa las herramientas MCP para cualquier afirmación sobre Pokémon, la colección, estadísticas o la investigación del usuario.',
  'No inventes datos ni afirmes haber modificado información: todas las herramientas MCP son de solo lectura.',
  `Resuelve cada consulta con el menor número posible de llamadas MCP y no solicites más de ${MAX_ASSISTANT_TOOL_OPERATIONS}.`,
  'Cuando una herramienta incluya referencias [n], conserva esas referencias en la respuesta.',
  'Puedes responder saludos y explicar tus capacidades sin herramientas.',
].join(' ')

export const assistantInputSchema = z
  .object({
    message: z.string().trim().min(1).max(500),
    conversationId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),
  })
  .strict()

const conversationQuerySchema = z.object({
  conversationId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
})

type ConversationDocument = {
  userId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export type AssistantCitation = {
  id: number
  label: string
  source: 'PokéAPI' | 'Colección' | 'Estadísticas' | 'Investigación'
  fact: string
  href?: string
}

export type AssistantToolName = McpToolName

export type AssistantToolOperation = {
  name: AssistantToolName
  input: Record<string, unknown>
}

export type AssistantCapability = {
  kimi: boolean
  mcp: true
  model: typeof KIMI_MODEL
}

export type AssistantActivityEvent =
  | { type: 'status'; phase: 'thinking' | 'writing' }
  | { type: 'tool_call'; operation: AssistantToolOperation }
  | {
      type: 'tool_result'
      operation: AssistantToolOperation
      citations: AssistantCitation[]
    }

export type AssistantStreamEvent =
  | AssistantActivityEvent
  | {
      type: 'complete'
      conversationId: string
      message: AssistantMessage
    }
  | { type: 'error'; message: string }

type AssistantActivityReporter = (
  event: AssistantActivityEvent,
) => void | Promise<void>

type MessageDocument = {
  userId: string
  conversationId: ObjectId
  role: 'user' | 'assistant'
  content: string
  citations: AssistantCitation[]
  toolCalls: AssistantToolOperation[]
  createdAt: Date
}

export type AssistantMessage = Omit<MessageDocument, 'conversationId'> & {
  id: string
  conversationId: string
}

export type AssistantConversation = ConversationDocument & { id: string }

const assistantToolOperationSchema = z.discriminatedUnion('name', [
  z
    .object({
      name: z.literal('search_pokemon'),
      input: z
        .object({
          query: z.string().trim().min(1).max(40),
          limit: z.number().int().min(1).max(20).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('get_pokemon'),
      input: z
        .object({
          pokemonId: z.union([
            z.number().int().min(1).max(1025),
            z.string().trim().min(1).max(40),
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('list_my_collection'),
      input: z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('get_collection_stats'),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('compare_pokemon'),
      input: z
        .object({
          leftId: z.union([
            z.number().int().min(1).max(1025),
            z.string().trim().min(1).max(40),
          ]),
          rightId: z.union([
            z.number().int().min(1).max(1025),
            z.string().trim().min(1).max(40),
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('get_research_progress'),
      input: z.object({}).strict(),
    })
    .strict(),
])

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

export function getAssistantCapability(
  input: NodeJS.ProcessEnv = process.env,
): AssistantCapability {
  try {
    const config = loadKimiConfig(input)
    return {
      kimi: config.enabled && config.apiKey !== undefined,
      mcp: true,
      model: KIMI_MODEL,
    }
  } catch {
    return { kimi: false, mcp: true, model: KIMI_MODEL }
  }
}

export function createConfiguredAssistantChat(
  input: NodeJS.ProcessEnv = process.env,
): KimiChatPort | undefined {
  const capability = getAssistantCapability(input)
  return capability.kimi ? createConfiguredKimiChatAdapter(input) : undefined
}

export class AssistantNotFoundError extends Error {
  readonly status = 404

  constructor() {
    super('Conversación no encontrada.')
    this.name = 'AssistantNotFoundError'
  }
}

export class AssistantToolLimitError extends Error {
  readonly status = 400

  constructor() {
    super('La solicitud requiere demasiadas operaciones.')
    this.name = 'AssistantToolLimitError'
  }
}

function displayName(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function cleanConversation(
  document: WithId<ConversationDocument>,
): AssistantConversation {
  const { _id, ...conversation } = document
  return { id: _id.toHexString(), ...conversation }
}

function cleanMessage(document: WithId<MessageDocument>): AssistantMessage {
  const { _id, conversationId, ...message } = document
  return {
    id: _id.toHexString(),
    conversationId: conversationId.toHexString(),
    ...message,
  }
}

export function routeAssistantIntent(
  message: string,
): AssistantToolOperation[] {
  const normalized = message.trim().toLowerCase()
  const comparison = normalized.match(
    /^(?:\/compare|compara|comparar)\s+([a-z0-9-]+)\s+(?:con\s+)?([a-z0-9-]+)$/,
  )
  if (comparison?.[1] && comparison[2]) {
    return [
      {
        name: 'compare_pokemon',
        input: { leftId: comparison[1], rightId: comparison[2] },
      },
    ]
  }

  const search = normalized.match(
    /^(?:\/search|busca|buscar|encuentra)\s+(.+)$/,
  )
  if (search?.[1]) {
    return [
      {
        name: 'search_pokemon',
        input: { query: search[1].slice(0, 40), limit: 5 },
      },
    ]
  }

  const details = normalized.match(
    /^(?:\/pokemon|pok[eé]mon|datos de|ficha de)\s+([a-z0-9-]+)$/,
  )
  if (details?.[1]) {
    return [{ name: 'get_pokemon', input: { pokemonId: details[1] } }]
  }

  if (normalized === '/collection' || /\bcolecci[oó]n\b/.test(normalized)) {
    return [{ name: 'list_my_collection', input: { limit: 20 } }]
  }
  if (
    normalized === '/stats' ||
    /\b(?:estad[ií]sticas|distribuci[oó]n|favoritos)\b/.test(normalized)
  ) {
    return [{ name: 'get_collection_stats', input: {} }]
  }
  if (
    normalized === '/research' ||
    /\b(?:investigaci[oó]n|expedici[oó]n|objetivos)\b/.test(normalized)
  ) {
    return [{ name: 'get_research_progress', input: {} }]
  }
  return []
}

export async function executeToolOperations<T>(
  operations: AssistantToolOperation[],
  execute: (operation: AssistantToolOperation) => Promise<T>,
) {
  if (operations.length > MAX_ASSISTANT_TOOL_OPERATIONS) {
    throw new AssistantToolLimitError()
  }
  const results: T[] = []
  for (const operation of operations) results.push(await execute(operation))
  return results
}

type ToolAnswer = { answer: string; citations: AssistantCitation[] }

type McpListedTools = Awaited<ReturnType<McpToolClient['listTools']>>

function kimiToolsFromMcp(tools: McpListedTools): KimiChatTool[] {
  const supported = new Set<string>(MCP_TOOL_NAMES)
  const mapped = tools
    .filter((tool) => supported.has(tool.name))
    .map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description ?? `Read-only MCP tool ${tool.name}.`,
        parameters: tool.inputSchema,
      },
    }))
  if (mapped.length !== MCP_TOOL_NAMES.length) throw new McpClientError()
  return mapped
}

function parseAssistantToolCall(
  toolCall: KimiToolCall,
): AssistantToolOperation {
  let input: unknown
  try {
    input = JSON.parse(toolCall.arguments) as unknown
  } catch {
    throw new KimiAdapterError('KIMI_RESULT_INVALID')
  }
  const parsed = assistantToolOperationSchema.safeParse({
    name: toolCall.name,
    input,
  })
  if (!parsed.success) throw new KimiAdapterError('KIMI_RESULT_INVALID')
  return parsed.data
}

function reindexToolAnswer(result: ToolAnswer, firstId: number): ToolAnswer {
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

export function createAssistantService(
  database: Db,
  ports: {
    chat?: KimiChatPort
    connectMcp?: (principal: McpPrincipal) => Promise<McpToolClient>
    now?: () => Date
  } = {},
) {
  const conversations =
    database.collection<ConversationDocument>('conversations')
  const messages = database.collection<MessageDocument>('messages')
  const chat = ports.chat
  const connectMcp = ports.connectMcp ?? createMcpToolClient
  const now = ports.now ?? (() => new Date())

  function toolAnswerFromMcp(
    operation: AssistantToolOperation,
    data: unknown,
  ): ToolAnswer {
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

  async function executeTool(
    mcp: McpToolClient,
    operation: AssistantToolOperation,
  ): Promise<ToolAnswer> {
    try {
      const result = await mcp.callTool(operation.name, operation.input)
      return toolAnswerFromMcp(operation, result.data)
    } catch (error) {
      if (error instanceof McpClientError) throw error
      throw new McpClientError()
    }
  }

  async function answerWithKimi(
    mcp: McpToolClient,
    tools: KimiChatTool[],
    message: string,
    context: MessageDocument[],
    report?: AssistantActivityReporter,
  ): Promise<ToolAnswer & { operations: AssistantToolOperation[] }> {
    if (chat === undefined) throw new KimiAdapterError('KIMI_LIVE_DISABLED')

    const kimiMessages: KimiChatMessage[] = [
      { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
      ...context.map((entry) => ({
        role: entry.role,
        content: entry.content,
      })),
      { role: 'user', content: message },
    ]
    const operations: AssistantToolOperation[] = []
    const citations: AssistantCitation[] = []
    const verifiedAnswers: string[] = []

    while (true) {
      await report?.({
        type: 'status',
        phase: operations.length === 0 ? 'thinking' : 'writing',
      })
      const completion = await chat.complete({
        messages: kimiMessages,
        tools,
      })
      if (completion.finishReason === 'stop') {
        return { answer: completion.content, citations, operations }
      }

      if (
        new Set(completion.toolCalls.map((toolCall) => toolCall.id)).size !==
        completion.toolCalls.length
      ) {
        throw new KimiAdapterError('KIMI_RESULT_INVALID')
      }
      const requested = completion.toolCalls.map(parseAssistantToolCall)
      if (
        operations.length + requested.length >
        MAX_ASSISTANT_TOOL_OPERATIONS
      ) {
        await report?.({ type: 'status', phase: 'writing' })
        const verifiedAnswer =
          verifiedAnswers.length > 0
            ? `Con los datos verificados disponibles:\n\n${verifiedAnswers.join('\n\n')}`
            : 'No pude reunir contexto suficiente para responder con datos verificados. Intenta acotar la consulta a tu colección, estadísticas, una comparación o una búsqueda.'
        const synthesis = await chat.complete({
          messages: [
            ...kimiMessages,
            {
              role: 'system',
              content:
                'Ya alcanzaste el presupuesto de herramientas. Responde ahora usando únicamente los resultados verificados disponibles y conserva sus referencias [n].',
            },
          ],
          tools: [],
        })
        return {
          answer:
            synthesis.finishReason === 'stop'
              ? synthesis.content
              : verifiedAnswer,
          citations,
          operations,
        }
      }
      kimiMessages.push({
        role: 'assistant',
        content: completion.content,
        toolCalls: completion.toolCalls,
      })

      for (const [index, toolCall] of completion.toolCalls.entries()) {
        const operation = requested[index]
        if (operation === undefined)
          throw new KimiAdapterError('KIMI_RESULT_INVALID')
        await report?.({ type: 'tool_call', operation })
        const result = await executeTool(mcp, operation)
        const reindexed = reindexToolAnswer(result, citations.length + 1)
        operations.push(operation)
        citations.push(...reindexed.citations)
        verifiedAnswers.push(reindexed.answer)
        await report?.({
          type: 'tool_result',
          operation,
          citations: reindexed.citations,
        })
        kimiMessages.push({
          role: 'tool',
          toolCallId: toolCall.id,
          name: toolCall.name,
          content: JSON.stringify(reindexed),
        })
      }
    }
  }

  async function ensureConversation(userId: string, id: string) {
    const conversation = await conversations.findOne({
      _id: new ObjectId(id),
      userId,
    })
    if (conversation === null) throw new AssistantNotFoundError()
    return conversation
  }

  async function send(
    userId: string,
    input: unknown,
    report?: AssistantActivityReporter,
  ) {
    const parsed = assistantInputSchema.parse(input)
    const mcp = await connectMcp({ subject: userId, scopes: ['mcp:read'] })
    try {
      const tools = kimiToolsFromMcp(await mcp.listTools())
      const timestamp = now()
      let conversation: WithId<ConversationDocument>
      if (parsed.conversationId === undefined) {
        const document: ConversationDocument = {
          userId,
          title:
            parsed.message.replace(/^\/\w+\s*/, '').slice(0, 60) ||
            'Nueva consulta',
          createdAt: timestamp,
          updatedAt: timestamp,
        }
        const insertedConversation = await conversations.insertOne(document)
        conversation = { _id: insertedConversation.insertedId, ...document }
      } else {
        conversation = await ensureConversation(userId, parsed.conversationId)
      }

      const context = (
        await messages
          .find({ userId, conversationId: conversation._id })
          .sort({ createdAt: -1 })
          .limit(MAX_ASSISTANT_CONTEXT_MESSAGES)
          .toArray()
      ).reverse()
      let operations: AssistantToolOperation[]
      let result: ToolAnswer
      if (chat !== undefined) {
        const generated = await answerWithKimi(
          mcp,
          tools,
          parsed.message,
          context,
          report,
        )
        operations = generated.operations
        result = generated
      } else {
        await report?.({ type: 'status', phase: 'thinking' })
        operations = routeAssistantIntent(parsed.message)
        const toolAnswers = await executeToolOperations(
          operations,
          async (operation) => {
            await report?.({ type: 'tool_call', operation })
            const toolAnswer = await executeTool(mcp, operation)
            await report?.({
              type: 'tool_result',
              operation,
              citations: toolAnswer.citations,
            })
            return toolAnswer
          },
        )
        await report?.({ type: 'status', phase: 'writing' })
        result = toolAnswers[0] ?? {
          answer:
            'Puedo consultar por MCP el catálogo, tu colección, estadísticas, comparaciones e investigación. Prueba “busca pikachu”, “estadísticas”, “compara pikachu con raichu” o “investigación”.',
          citations: [],
        }
      }
      const userMessage: MessageDocument = {
        userId,
        conversationId: conversation._id,
        role: 'user',
        content: parsed.message,
        citations: [],
        toolCalls: [],
        createdAt: timestamp,
      }
      const assistantMessage: MessageDocument = {
        userId,
        conversationId: conversation._id,
        role: 'assistant',
        content: result.answer,
        citations: result.citations,
        toolCalls: operations,
        createdAt: new Date(timestamp.getTime() + 1),
      }
      const inserted = await messages.insertMany([
        userMessage,
        assistantMessage,
      ])
      await conversations.updateOne(
        { _id: conversation._id, userId },
        { $set: { updatedAt: assistantMessage.createdAt } },
      )

      return {
        conversationId: conversation._id.toHexString(),
        message: cleanMessage({
          _id: inserted.insertedIds[1],
          ...assistantMessage,
        }),
      }
    } finally {
      await mcp.close()
    }
  }

  async function history(userId: string, input: unknown = {}) {
    const parsed = conversationQuerySchema.parse(input)
    const ownedConversations = await conversations
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray()
    if (parsed.conversationId === undefined) {
      return { conversations: ownedConversations.map(cleanConversation) }
    }

    await ensureConversation(userId, parsed.conversationId)
    const conversationId = new ObjectId(parsed.conversationId)
    const ownedMessages = await messages
      .find({ userId, conversationId })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray()
    return {
      conversations: ownedConversations.map(cleanConversation),
      messages: ownedMessages.map(cleanMessage),
    }
  }

  return { history, send }
}
