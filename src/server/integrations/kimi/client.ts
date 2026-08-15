import '@tanstack/react-start/server-only'

import {
  KIMI_API_BASE_URL,
  KIMI_DEFAULT_TIMEOUT_MS,
  KimiAdapterError,
  type KimiAdapterOptions,
  type KimiChatCompletion,
  type KimiPokemonResult,
  kimiChatResponseSchema,
  kimiPokemonResultSchema,
  kimiResponseSchema,
} from '@/server/integrations/kimi/contracts'

type RequestSignal = {
  signal: AbortSignal
  didTimeout: () => boolean
  didCallerAbort: () => boolean
  cleanup: () => void
}

function createRequestSignal(
  timeoutMs: number,
  callerSignal: AbortSignal | undefined,
): RequestSignal {
  const controller = new AbortController()
  let timedOut = false
  let callerAborted = false

  const abortFromCaller = () => {
    callerAborted = true
    controller.abort()
  }

  if (callerSignal?.aborted) abortFromCaller()
  else callerSignal?.addEventListener('abort', abortFromCaller, { once: true })

  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    didCallerAbort: () => callerAborted,
    cleanup: () => {
      clearTimeout(timeout)
      callerSignal?.removeEventListener('abort', abortFromCaller)
    },
  }
}

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

  const timeoutMs = options.timeoutMs ?? KIMI_DEFAULT_TIMEOUT_MS
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120_000) {
    throw new KimiAdapterError('KIMI_CONFIG_INVALID')
  }

  return {
    apiKey,
    endpoint: createChatEndpoint(options.baseUrl ?? KIMI_API_BASE_URL),
    fetch: options.fetch ?? fetch,
    timeoutMs,
  }
}

export function decodeKimiContent(payload: unknown): unknown {
  const parsedResponse = kimiResponseSchema.safeParse(payload)
  if (!parsedResponse.success) {
    throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
  }

  const choice = parsedResponse.data.choices[0]
  if (choice.finish_reason === 'length') {
    throw new KimiAdapterError('KIMI_RESPONSE_TRUNCATED')
  }
  if (choice.finish_reason !== 'stop') {
    throw new KimiAdapterError('KIMI_FINISH_REASON_INVALID')
  }

  if (typeof choice.message.content !== 'string') {
    throw new KimiAdapterError('KIMI_CONTENT_MISSING')
  }

  const content = choice.message.content.trim()
  if (content.length === 0) throw new KimiAdapterError('KIMI_CONTENT_MISSING')

  let decoded: unknown
  try {
    decoded = JSON.parse(content) as unknown
  } catch {
    throw new KimiAdapterError('KIMI_JSON_INVALID')
  }

  return decoded
}

export function parseKimiResponse(payload: unknown): KimiPokemonResult {
  const parsedResult = kimiPokemonResultSchema.safeParse(
    decodeKimiContent(payload),
  )
  if (!parsedResult.success) throw new KimiAdapterError('KIMI_RESULT_INVALID')
  return parsedResult.data
}

export function parseKimiChatResponse(payload: unknown): KimiChatCompletion {
  const parsedResponse = kimiChatResponseSchema.safeParse(payload)
  if (!parsedResponse.success) {
    throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
  }

  const choice = parsedResponse.data.choices[0]
  if (choice.finish_reason === 'length') {
    throw new KimiAdapterError('KIMI_RESPONSE_TRUNCATED')
  }
  if (choice.finish_reason === 'tool_calls') {
    const toolCalls = choice.message.tool_calls
    if (toolCalls === undefined || toolCalls.length === 0) {
      throw new KimiAdapterError('KIMI_RESULT_INVALID')
    }
    return {
      finishReason: 'tool_calls',
      content:
        typeof choice.message.content === 'string'
          ? choice.message.content.trim()
          : '',
      toolCalls: toolCalls.map((toolCall) => ({
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      })),
    }
  }
  if (choice.finish_reason !== 'stop') {
    throw new KimiAdapterError('KIMI_FINISH_REASON_INVALID')
  }
  if (typeof choice.message.content !== 'string') {
    throw new KimiAdapterError('KIMI_CONTENT_MISSING')
  }
  const content = choice.message.content.trim()
  if (content.length === 0) throw new KimiAdapterError('KIMI_CONTENT_MISSING')
  if (content.length > 8_000) throw new KimiAdapterError('KIMI_RESULT_INVALID')
  return { finishReason: 'stop', content, toolCalls: [] }
}

export async function executeKimiRequest<T>(
  validated: ReturnType<typeof validateAdapterOptions>,
  body: unknown,
  callerSignal: AbortSignal | undefined,
  parse: (payload: unknown) => T,
) {
  const requestSignal = createRequestSignal(validated.timeoutMs, callerSignal)
  try {
    let response: Response
    try {
      response = await validated.fetch(validated.endpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${validated.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: requestSignal.signal,
      })
    } catch {
      if (requestSignal.didTimeout()) {
        throw new KimiAdapterError('KIMI_TIMEOUT')
      }
      if (requestSignal.didCallerAbort()) {
        throw new KimiAdapterError('KIMI_ABORTED')
      }
      throw new KimiAdapterError('KIMI_REQUEST_FAILED')
    }

    if (response.status !== 200) {
      throw new KimiAdapterError('KIMI_HTTP_STATUS', response.status)
    }

    let payload: unknown
    try {
      payload = (await response.json()) as unknown
    } catch {
      if (requestSignal.didTimeout()) {
        throw new KimiAdapterError('KIMI_TIMEOUT')
      }
      if (requestSignal.didCallerAbort()) {
        throw new KimiAdapterError('KIMI_ABORTED')
      }
      throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
    }
    return parse(payload)
  } finally {
    requestSignal.cleanup()
  }
}
