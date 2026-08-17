import '@tanstack/react-start/server-only'

const HEARTBEAT_INTERVAL_MS = 15_000

export function createEventStreamResponse<T>(
  run: (send: (event: T) => void, signal: AbortSignal) => void | Promise<void>,
) {
  const encoder = new TextEncoder()
  const abortController = new AbortController()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  let cancelled = false

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (value: string) => {
        if (!cancelled) controller.enqueue(encoder.encode(value))
      }
      const send = (event: T) => {
        enqueue(`data: ${JSON.stringify(event)}\n\n`)
      }

      enqueue(': connected\n\n')
      heartbeat = setInterval(
        () => enqueue(': keep-alive\n\n'),
        HEARTBEAT_INTERVAL_MS,
      )

      void Promise.resolve(run(send, abortController.signal)).finally(() => {
        if (heartbeat !== undefined) clearInterval(heartbeat)
        if (!cancelled) controller.close()
      })
    },
    cancel() {
      cancelled = true
      if (heartbeat !== undefined) clearInterval(heartbeat)
      abortController.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
