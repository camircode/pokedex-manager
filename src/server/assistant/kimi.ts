import '@tanstack/react-start/server-only'

import { reindexToolAnswer, type ToolAnswer } from '@/server/assistant/context'
import {
  type AssistantActivityReporter,
  type AssistantCitation,
  type AssistantContextMessage,
  type AssistantToolOperation,
  assistantToolOperationSchema,
  MAX_ASSISTANT_TOOL_OPERATIONS,
} from '@/server/assistant/contracts'
import {
  KimiAdapterError,
  type KimiChatMessage,
  type KimiChatPort,
  type KimiChatTool,
  type KimiToolCall,
} from '@/server/integrations/kimi'
import {
  MCP_TOOL_NAMES,
  McpClientError,
  type McpToolClient,
} from '@/server/integrations/mcp'

const ASSISTANT_SYSTEM_PROMPT = `Eres el asistente de campo de Pokédex Manager. Responde siempre en español claro y directo.
Usa las herramientas cuando necesites hechos del catálogo, colección, estadísticas o investigación.
Para buscar por tipo, generación, habilidad o categoría, usa los filtros estructurados de search_pokemon y omite query. Usa query únicamente para nombres o números de Pokémon. Traduce las etiquetas del usuario a los identificadores canónicos del schema, por ejemplo fuego a fire, planta a grass y generación I a generation-i.
No inventes datos. Para cada afirmación factual respaldada por herramientas, conserva las referencias [n] del contexto.
Las referencias solo pueden apuntar a las fuentes numeradas que recibas tras una herramienta.
No expongas llamadas de herramienta, JSON interno ni razonamiento privado.
Si la pregunta no necesita datos de herramientas, responde sin referencias.
Si una herramienta no puede completar una consulta, ajusta sus parámetros o continúa con otras herramientas y con los datos ya verificados.
Cuando uses varias herramientas, sintetiza sus resultados en una única respuesta útil.`

type McpListedTools = Awaited<ReturnType<McpToolClient['listTools']>>

export function kimiToolsFromMcp(tools: McpListedTools): KimiChatTool[] {
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

export async function answerWithKimi(input: {
  chat: KimiChatPort
  tools: KimiChatTool[]
  message: string
  context: AssistantContextMessage[]
  executeTool: (operation: AssistantToolOperation) => Promise<ToolAnswer>
  report?: AssistantActivityReporter
  signal?: AbortSignal
}): Promise<ToolAnswer & { operations: AssistantToolOperation[] }> {
  const kimiMessages: KimiChatMessage[] = [
    { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
    ...input.context.map((entry) => ({
      role: entry.role,
      content: entry.content,
    })),
    { role: 'user', content: input.message },
  ]
  const operations: AssistantToolOperation[] = []
  const citations: AssistantCitation[] = []
  const verifiedAnswers: string[] = []

  while (true) {
    const completion = await input.chat.complete(
      {
        messages: kimiMessages,
        tools: input.tools,
      },
      {
        signal: input.signal,
        onReasoning: (delta) => input.report?.({ type: 'reasoning', delta }),
      },
    )
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
    if (operations.length + requested.length > MAX_ASSISTANT_TOOL_OPERATIONS) {
      const verifiedAnswer =
        verifiedAnswers.length > 0
          ? `Con los datos verificados disponibles:\n\n${verifiedAnswers.join('\n\n')}`
          : 'No pude reunir contexto suficiente para responder con datos verificados. Intenta acotar la consulta a tu colección, estadísticas, una comparación o una búsqueda.'
      const synthesis = await input.chat.complete(
        {
          messages: [
            ...kimiMessages,
            {
              role: 'system',
              content:
                'Ya alcanzaste el presupuesto de herramientas. Responde ahora usando únicamente los resultados verificados disponibles y conserva sus referencias [n].',
            },
          ],
          tools: [],
        },
        {
          signal: input.signal,
          onReasoning: (delta) => input.report?.({ type: 'reasoning', delta }),
        },
      )
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
      reasoningContent: completion.reasoningContent,
      toolCalls: completion.toolCalls,
    })

    for (const [index, toolCall] of completion.toolCalls.entries()) {
      const operation = requested[index]
      if (operation === undefined)
        throw new KimiAdapterError('KIMI_RESULT_INVALID')
      await input.report?.({ type: 'tool_call', operation })
      const result = await input.executeTool(operation)
      const reindexed = reindexToolAnswer(result, citations.length + 1)
      operations.push(operation)
      citations.push(...reindexed.citations)
      verifiedAnswers.push(reindexed.answer)
      await input.report?.({
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
