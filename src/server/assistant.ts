import '@tanstack/react-start/server-only'

import type { Db } from 'mongodb'
import { type ToolAnswer, toolAnswerFromMcp } from '@/server/assistant/context'
import {
  type AssistantActivityReporter,
  type AssistantCapability,
  type AssistantToolOperation,
  assistantInputSchema,
} from '@/server/assistant/contracts'
import { answerWithKimi, kimiToolsFromMcp } from '@/server/assistant/kimi'
import { createAssistantRepository } from '@/server/assistant/repository'
import {
  executeToolOperations,
  routeAssistantIntent,
} from '@/server/assistant/router'
import {
  createConfiguredKimiChatAdapter,
  KIMI_MODEL,
  type KimiChatPort,
  loadKimiConfig,
} from '@/server/integrations/kimi'
import {
  createMcpToolClient,
  McpClientError,
  type McpPrincipal,
  type McpToolClient,
} from '@/server/integrations/mcp'

export * from '@/server/assistant/contracts'
export {
  executeToolOperations,
  routeAssistantIntent,
} from '@/server/assistant/router'

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

export function createAssistantService(
  database: Db,
  ports: {
    chat?: KimiChatPort
    connectMcp?: (principal: McpPrincipal) => Promise<McpToolClient>
    now?: () => Date
  } = {},
) {
  const repository = createAssistantRepository(database)
  const chat = ports.chat
  const connectMcp = ports.connectMcp ?? createMcpToolClient
  const now = ports.now ?? (() => new Date())

  async function send(
    userId: string,
    input: unknown,
    report?: AssistantActivityReporter,
    signal?: AbortSignal,
  ) {
    const parsed = assistantInputSchema.parse(input)
    const mcp = await connectMcp({ subject: userId, scopes: ['mcp:read'] })
    try {
      const tools = kimiToolsFromMcp(await mcp.listTools())
      const timestamp = now()
      const conversation = await repository.prepareConversation(
        userId,
        parsed.conversationId,
        parsed.message,
        timestamp,
      )
      const context = await repository.loadContext(userId, conversation._id)
      const executeTool = async (
        operation: AssistantToolOperation,
      ): Promise<ToolAnswer> => {
        try {
          const result = await mcp.callTool(operation.name, operation.input)
          return toolAnswerFromMcp(operation, result.data)
        } catch (error) {
          if (error instanceof McpClientError) throw error
          throw new McpClientError()
        }
      }

      let operations: AssistantToolOperation[]
      let result: ToolAnswer
      if (chat !== undefined) {
        const generated = await answerWithKimi({
          chat,
          tools,
          message: parsed.message,
          context,
          executeTool,
          report,
          signal,
        })
        operations = generated.operations
        result = generated
      } else {
        await report?.({ type: 'status', phase: 'thinking' })
        operations = routeAssistantIntent(parsed.message)
        const toolAnswers = await executeToolOperations(
          operations,
          async (operation) => {
            await report?.({ type: 'tool_call', operation })
            const toolAnswer = await executeTool(operation)
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

      return repository.saveExchange({
        userId,
        conversationId: conversation._id,
        userContent: parsed.message,
        assistantContent: result.answer,
        citations: result.citations,
        toolCalls: operations,
        timestamp,
      })
    } finally {
      await mcp.close()
    }
  }

  return { history: repository.history, send }
}
