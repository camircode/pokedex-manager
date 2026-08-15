import { describe, expect, it, vi } from 'vitest'

import { consumeEventStream } from '../../src/lib/event-stream'

type Event =
  | { type: 'phase'; phase: string }
  | { type: 'complete'; value: string }

const options = {
  isTerminal: (event: Event) => event.type === 'complete',
}

describe('event stream consumer', () => {
  it('delivers events and requires a terminal event', async () => {
    const onEvent = vi.fn()
    const response = new Response(
      'data: {"type":"phase","phase":"reading"}\n\n' +
        'data: {"type":"complete","value":"ready"}\n\n',
    )

    await consumeEventStream<Event>(response, onEvent, options)

    expect(onEvent).toHaveBeenCalledTimes(2)
    expect(onEvent).toHaveBeenLastCalledWith({
      type: 'complete',
      value: 'ready',
    })
  })

  it('rejects a truncated stream without a terminal event', async () => {
    const response = new Response(
      'data: {"type":"phase","phase":"reading"}\n\n',
    )

    await expect(
      consumeEventStream<Event>(response, () => undefined, options),
    ).rejects.toThrow('La operación terminó sin una respuesta completa.')
  })

  it('parses the final frame even without a trailing separator', async () => {
    const onEvent = vi.fn()
    const response = new Response('data: {"type":"complete","value":"ready"}')

    await consumeEventStream<Event>(response, onEvent, options)

    expect(onEvent).toHaveBeenCalledWith({ type: 'complete', value: 'ready' })
  })
})
