import { createFileRoute } from '@tanstack/react-router'

import {
  type AssistantStreamEvent,
  createAssistantService,
  createConfiguredAssistantChat,
  getAssistantCapability,
} from '@/server/assistant'
import { requireUser } from '@/server/auth'
import { getMongoClient } from '@/server/db/mongo-client'
import { apiError, assertTrustedMutation, readJsonBody } from '@/server/http'
import { KimiAdapterError } from '@/server/integrations/kimi'
import { McpClientError } from '@/server/integrations/mcp'

type AssistantHandlerDependencies = {
  authenticate?: (headers: Headers) => Promise<{ id: string }>
  service?: Pick<ReturnType<typeof createAssistantService>, 'history' | 'send'>
}

async function assistantErrorMessage(error: unknown) {
  if (error instanceof McpClientError) {
    return 'El contexto MCP no está disponible en este momento.'
  }
  if (error instanceof KimiAdapterError) {
    return 'El asistente con Kimi no está disponible en este momento.'
  }
  const response = apiError(error)
  const payload = (await response.json()) as { error?: string }
  return payload.error ?? 'No se pudo completar la operación.'
}

function streamAssistantResponse(
  service: Pick<ReturnType<typeof createAssistantService>, 'send'>,
  userId: string,
  input: unknown,
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendEvent = (event: AssistantStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        const result = await service.send(userId, input, sendEvent)
        sendEvent({ type: 'complete', ...result })
      } catch (error) {
        sendEvent({
          type: 'error',
          message: await assistantErrorMessage(error),
        })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export async function assistantHandler(
  request: Request,
  dependencies: AssistantHandlerDependencies = {},
) {
  try {
    const user = await (dependencies.authenticate ?? requireUser)(
      request.headers,
    )
    const service =
      dependencies.service ??
      createAssistantService(await getMongoClient().connect(), {
        chat: createConfiguredAssistantChat(),
      })
    if (request.method === 'POST') {
      assertTrustedMutation(request)
      const input = await readJsonBody(request)
      if (request.headers.get('Accept')?.includes('text/event-stream')) {
        return streamAssistantResponse(service, user.id, input)
      }
      return Response.json(await service.send(user.id, input), {
        status: 201,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
    const url = new URL(request.url)
    const history = await service.history(user.id, {
      conversationId: url.searchParams.get('conversationId') ?? undefined,
    })
    return Response.json(
      { ...history, capability: getAssistantCapability() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof McpClientError) {
      return Response.json(
        {
          status: 'unavailable',
          error: 'El contexto MCP no está disponible en este momento.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    if (error instanceof KimiAdapterError) {
      return Response.json(
        {
          status: 'unavailable',
          error: 'El asistente con Kimi no está disponible en este momento.',
        },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    const response = apiError(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const Route = createFileRoute('/api/assistant')({
  server: {
    handlers: {
      GET: ({ request }) => assistantHandler(request),
      POST: ({ request }) => assistantHandler(request),
    },
  },
})
