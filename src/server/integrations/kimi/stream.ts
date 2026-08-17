import '@tanstack/react-start/server-only'

import {
  KimiAdapterError,
  kimiStreamChunkSchema,
  type KimiStreamCompletion,
  type KimiToolCall,
} from '@/server/integrations/kimi/contracts'

type PendingToolCall = {
  id: string
  name: string
  arguments: string
}

function appendToolCall(
  calls: Map<number, PendingToolCall>,
  delta: {
    index: number
    id?: string
    function?: { name?: string; arguments?: string }
  },
) {
  const current = calls.get(delta.index) ?? {
    id: '',
    name: '',
    arguments: '',
  }
  if (delta.id !== undefined) current.id += delta.id
  if (delta.function?.name !== undefined) current.name += delta.function.name
  if (delta.function?.arguments !== undefined) {
    current.arguments += delta.function.arguments
  }
  if (
    current.id.length > 128 ||
    current.name.length > 64 ||
    current.arguments.length > 2_000
  ) {
    throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
  }
  calls.set(delta.index, current)
}

function finalizeToolCalls(
  calls: Map<number, PendingToolCall>,
): KimiToolCall[] {
  return [...calls.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, call]) => {
      if (call.id.length === 0 || call.name.length === 0) {
        throw new KimiAdapterError('KIMI_RESULT_INVALID')
      }
      return call
    })
}

export async function consumeKimiStream(
  response: Response,
  onReasoning: ((delta: string) => void | Promise<void>) | undefined,
): Promise<KimiStreamCompletion> {
  if (response.body === null)
    throw new KimiAdapterError('KIMI_RESPONSE_INVALID')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const toolCalls = new Map<number, PendingToolCall>()
  let buffer = ''
  let content = ''
  let reasoningContent = ''
  let finishReason = ''
  let doneReceived = false

  const processFrame = async (frame: string) => {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n')
    if (data.length === 0) return
    if (data === '[DONE]') {
      doneReceived = true
      return
    }

    let payload: unknown
    try {
      payload = JSON.parse(data) as unknown
    } catch {
      throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
    }
    const parsed = kimiStreamChunkSchema.safeParse(payload)
    if (!parsed.success) throw new KimiAdapterError('KIMI_RESPONSE_INVALID')

    for (const choice of parsed.data.choices) {
      const reasoningDelta = choice.delta.reasoning_content
      if (typeof reasoningDelta === 'string' && reasoningDelta.length > 0) {
        reasoningContent += reasoningDelta
        if (reasoningContent.length > 128_000) {
          throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
        }
        await onReasoning?.(reasoningDelta)
      }
      const contentDelta = choice.delta.content
      if (typeof contentDelta === 'string' && contentDelta.length > 0) {
        content += contentDelta
        if (content.length > 16_000) {
          throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
        }
      }
      for (const toolCall of choice.delta.tool_calls ?? []) {
        appendToolCall(toolCalls, toolCall)
      }
      if (choice.finish_reason !== null && choice.finish_reason !== undefined) {
        finishReason = choice.finish_reason
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    const frames = buffer.split(/\r?\n\r?\n/)
    buffer = frames.pop() ?? ''
    for (const frame of frames) await processFrame(frame)
    if (done) break
  }
  if (buffer.trim().length > 0) await processFrame(buffer)
  if (!doneReceived || finishReason.length === 0) {
    throw new KimiAdapterError('KIMI_RESPONSE_INVALID')
  }

  return {
    finishReason,
    content,
    reasoningContent,
    toolCalls: finalizeToolCalls(toolCalls),
  }
}
