import { describe, expect, it } from 'vitest'

import { consumeKimiStream } from '../../src/server/integrations/kimi/stream'

function streamResponse(chunks: string[]) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } },
  )
}

describe('Kimi SSE transport', () => {
  it('reassembles fragmented reasoning and content frames', async () => {
    const reasoning: string[] = []
    const first = JSON.stringify({
      choices: [
        {
          finish_reason: null,
          delta: { reasoning_content: 'Analizo la silueta. ' },
        },
      ],
    })
    const second = JSON.stringify({
      choices: [
        {
          finish_reason: 'stop',
          delta: { reasoning_content: 'Coincide.', content: 'Pikachu' },
        },
      ],
    })

    const completion = await consumeKimiStream(
      streamResponse([
        `data: ${first.slice(0, 30)}`,
        `${first.slice(30)}\n\ndata: ${second}\n\n`,
        'data: [DONE]\n\n',
      ]),
      (delta) => {
        reasoning.push(delta)
      },
    )

    expect(completion).toMatchObject({
      finishReason: 'stop',
      content: 'Pikachu',
      reasoningContent: 'Analizo la silueta. Coincide.',
    })
    expect(reasoning.join('')).toBe(completion.reasoningContent)
  })

  it('reassembles streamed tool call arguments', async () => {
    const frames = [
      {
        choices: [
          {
            finish_reason: null,
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call-1',
                  type: 'function',
                  function: { name: 'search_pokemon', arguments: '{"que' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            finish_reason: 'tool_calls',
            delta: {
              tool_calls: [
                { index: 0, function: { arguments: 'ry":"pikachu"}' } },
              ],
            },
          },
        ],
      },
    ]
    const payload = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`)
    payload.push('data: [DONE]\n\n')

    await expect(
      consumeKimiStream(streamResponse(payload), undefined),
    ).resolves.toMatchObject({
      finishReason: 'tool_calls',
      toolCalls: [
        {
          id: 'call-1',
          name: 'search_pokemon',
          arguments: '{"query":"pikachu"}',
        },
      ],
    })
  })
})
