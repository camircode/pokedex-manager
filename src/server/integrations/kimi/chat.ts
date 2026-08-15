import '@tanstack/react-start/server-only'

import {
  executeKimiRequest,
  parseKimiChatResponse,
  validateAdapterOptions,
} from '@/server/integrations/kimi/client'
import {
  KIMI_ASSISTANT_MAX_COMPLETION_TOKENS,
  KIMI_MODEL,
  KimiAdapterError,
  type KimiAdapterOptions,
  type KimiChatPort,
  loadKimiConfig,
} from '@/server/integrations/kimi/contracts'

export function createKimiChatAdapter(
  options: KimiAdapterOptions,
): KimiChatPort {
  const validated = validateAdapterOptions(options)

  return {
    async complete(input, completeOptions = {}) {
      if (
        input.messages.length === 0 ||
        input.messages.length > 30 ||
        input.tools.length > 10 ||
        input.messages.some(
          (message) =>
            message.content.length > 12_000 ||
            (message.content.length === 0 &&
              !(
                message.role === 'assistant' &&
                message.toolCalls !== undefined &&
                message.toolCalls.length > 0
              )),
        )
      ) {
        throw new KimiAdapterError('KIMI_INPUT_INVALID')
      }

      const messages = input.messages.map((message) => {
        if (message.role === 'tool') {
          return {
            role: message.role,
            content: message.content,
            name: message.name,
            tool_call_id: message.toolCallId,
          }
        }
        if (message.role === 'assistant' && message.toolCalls !== undefined) {
          return {
            role: message.role,
            content: message.content,
            tool_calls: message.toolCalls.map((toolCall) => ({
              id: toolCall.id,
              type: 'function' as const,
              function: {
                name: toolCall.name,
                arguments: toolCall.arguments,
              },
            })),
          }
        }
        return message
      })

      return executeKimiRequest(
        validated,
        {
          model: KIMI_MODEL,
          messages,
          ...(input.tools.length > 0 ? { tools: input.tools } : {}),
          stream: false as const,
          thinking: { type: 'disabled' as const },
          temperature: 0.6,
          max_completion_tokens: KIMI_ASSISTANT_MAX_COMPLETION_TOKENS,
        },
        completeOptions.signal,
        parseKimiChatResponse,
      )
    },
  }
}

export function createConfiguredKimiChatAdapter(
  input: NodeJS.ProcessEnv = process.env,
  options: Pick<KimiAdapterOptions, 'fetch' | 'baseUrl'> = {},
): KimiChatPort {
  const config = loadKimiConfig(input)
  if (!config.enabled || config.apiKey === undefined) {
    throw new KimiAdapterError('KIMI_LIVE_DISABLED')
  }

  return createKimiChatAdapter({
    apiKey: config.apiKey,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    timeoutMs: config.timeoutMs,
  })
}
