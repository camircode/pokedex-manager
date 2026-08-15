type EventStreamOptions<T> = {
  isTerminal: (event: T) => boolean
  parse?: (data: string) => T
}

export async function consumeEventStream<T>(
  response: Response,
  onEvent: (event: T) => void,
  options: EventStreamOptions<T>,
) {
  if (!response.ok || response.body === null) {
    const body = (await response.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'No se pudo iniciar la operación.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let terminalReceived = false
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const frames = buffer.split('\n\n')
      buffer = frames.pop() ?? ''
      if (done && buffer.trim() !== '') {
        frames.push(buffer)
        buffer = ''
      }
      for (const frame of frames) {
        const data = frame
          .split('\n')
          .find((line) => line.startsWith('data: '))
          ?.slice(6)
        if (data === undefined) continue
        const event = options.parse?.(data) ?? (JSON.parse(data) as T)
        terminalReceived ||= options.isTerminal(event)
        onEvent(event)
      }
      if (done) break
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined)
    throw error
  }

  if (!terminalReceived) {
    throw new Error('La operación terminó sin una respuesta completa.')
  }
}
