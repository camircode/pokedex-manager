import '@tanstack/react-start/server-only'

import {
  KIMI_API_BASE_URL,
  KimiAdapterError,
  type KimiAdapterOptions,
  type KimiChatCompletion,
  type KimiPokemonResult,
  type KimiStreamCompletion,
  type KimiToolCall,
  kimiPokemonResultSchema,
} from '@/server/integrations/kimi/contracts'
import { consumeKimiStream } from '@/server/integrations/kimi/stream'

function createChatEndpoint(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error('unsupported protocol')
    }
    return `${baseUrl.replace(/\/+$/, '')}/chat/completions`
  } catch {
    throw new KimiAdapterError('KIMI_CONFIG_INVALID')
  }
}

export function validateAdapterOptions(options: KimiAdapterOptions) {
  const apiKey = options.apiKey.trim()
  if (apiKey.length === 0) throw new KimiAdapterError('KIMI_CONFIG_INVALID')

  return {
    apiKey,
    endpoint: createChatEndpoint(options.baseUrl ?? KIMI_API_BASE_URL),
    fetch: options.fetch ?? fetch,
  }
}

function validateStreamFinishReason(completion: KimiStreamCompletion) {
  if (completion.finishReason === 'length') {
    throw new KimiAdapterError('KIMI_RESPONSE_TRUNCATED')
  }
  if (
    completion.finishReason !== 'stop' &&
    completion.finishReason !== 'tool_calls'
  ) {
    throw new KimiAdapterError('KIMI_FINISH_REASON_INVALID')
  }
}

export function parseKimiStreamResponse(
  completion: KimiStreamCompletion,
): KimiPokemonResult {
  validateStreamFinishReason(completion)
  if (completion.finishReason !== 'stop') {
    throw new KimiAdapterError('KIMI_FINISH_REASON_INVALID')
  }
  let decoded: unknown
  try {
    decoded = JSON.parse(completion.content.trim()) as unknown
  } catch {
    throw new KimiAdapterError('KIMI_JSON_INVALID')
  }
  const parsed = kimiPokemonResultSchema.safeParse(decoded)
  if (!parsed.success) throw new KimiAdapterError('KIMI_RESULT_INVALID')
  return parsed.data
}

export function parseKimiStreamChatResponse(
  completion: KimiStreamCompletion,
): KimiChatCompletion {
  validateStreamFinishReason(completion)
  if (completion.finishReason === 'tool_calls') {
    if (completion.toolCalls.length === 0) {
      throw new KimiAdapterError('KIMI_RESULT_INVALID')
    }
    return {
      finishReason: 'tool_calls',
      content: completion.content.trim(),
      reasoningContent: completion.reasoningContent,
      toolCalls: completion.toolCalls,
    }
  }
  const content = completion.content.trim()
  if (content.length === 0) throw new KimiAdapterError('KIMI_CONTENT_MISSING')
  if (content.length > 8_000) throw new KimiAdapterError('KIMI_RESULT_INVALID')
  return {
    finishReason: 'stop',
    content,
    reasoningContent: completion.reasoningContent,
    toolCalls: [],
  }
}

export function parseKimiStreamToolResponse(
  completion: KimiStreamCompletion,
): KimiToolCall {
  validateStreamFinishReason(completion)
  if (
    completion.finishReason !== 'tool_calls' ||
    completion.toolCalls.length !== 1
  ) {
    throw new KimiAdapterError('KIMI_RESULT_INVALID')
  }
  const toolCall = completion.toolCalls[0]
  if (toolCall === undefined) {
    throw new KimiAdapterError('KIMI_RESULT_INVALID')
  }
  return toolCall
}

export async function executeKimiStreamRequest<T>(
  validated: ReturnType<typeof validateAdapterOptions>,
  body: unknown,
  callerSignal: AbortSignal | undefined,
  parse: (completion: KimiStreamCompletion) => T,
  onReasoning?: (delta: string) => void | Promise<void>,
) {
  let response: Response
  try {
    response = await validated.fetch(validated.endpoint, {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        Authorization: `Bearer ${validated.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: callerSignal,
    })
  } catch {
    if (callerSignal?.aborted === true) {
      throw new KimiAdapterError('KIMI_ABORTED')
    }
    throw new KimiAdapterError('KIMI_REQUEST_FAILED')
  }
  if (response.status !== 200) {
    throw new KimiAdapterError('KIMI_HTTP_STATUS', response.status)
  }
  try {
    return parse(await consumeKimiStream(response, onReasoning))
  } catch (error) {
    if (callerSignal?.aborted === true) {
      throw new KimiAdapterError('KIMI_ABORTED')
    }
    if (error instanceof KimiAdapterError) throw error
    throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
  }
}
