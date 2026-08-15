import { createFileRoute } from '@tanstack/react-router'

import { requireUser } from '@/server/auth'
import { apiError, assertTrustedMutation } from '@/server/http'
import { KimiAdapterError } from '@/server/integrations/kimi'
import {
  generateResearchWithKimi,
  getResearchCapability,
  getResearchResponse,
  type ResearchActivityEvent,
  type ResearchExpedition,
  type ResearchResponse,
} from '@/server/research'

export type ResearchStreamEvent =
  | ResearchActivityEvent
  | { type: 'complete'; expedition: ResearchExpedition }
  | { type: 'error'; message: string }

type ResearchHandlerDependencies = {
  authenticate?: (headers: Headers) => Promise<{ id: string }>
  get?: (userId: string) => Promise<ResearchResponse>
  generate?: (
    userId: string,
    report?: (event: ResearchActivityEvent) => void | Promise<void>,
  ) => Promise<ResearchExpedition>
  capability?: () => boolean
}

function streamResearch(
  generate: NonNullable<ResearchHandlerDependencies['generate']>,
  userId: string,
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: ResearchStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        const expedition = await generate(userId, send)
        send({ type: 'complete', expedition })
      } catch (error) {
        send({
          type: 'error',
          message:
            error instanceof KimiAdapterError
              ? 'La generación con Kimi no está disponible en este momento.'
              : 'No se pudo generar la investigación.',
        })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function unavailableResponse() {
  return Response.json(
    {
      status: 'unavailable',
      error: 'La generación con Kimi no está disponible en este momento.',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  )
}

export async function researchHandler(
  request: Request,
  dependencies: ResearchHandlerDependencies = {},
) {
  try {
    const user =
      dependencies.authenticate === undefined
        ? await requireUser(request.headers)
        : await dependencies.authenticate(request.headers)
    if (request.method === 'POST') {
      assertTrustedMutation(request)
      const available =
        dependencies.capability?.() ?? getResearchCapability().kimi
      if (!available) return unavailableResponse()
      const generate = dependencies.generate ?? generateResearchWithKimi
      if (request.headers.get('Accept')?.includes('text/event-stream')) {
        return streamResearch(generate, user.id)
      }
      const expedition = await generate(user.id)
      return Response.json(
        { expedition, capability: getResearchCapability() },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return Response.json(
      await (dependencies.get ?? getResearchResponse)(user.id),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof KimiAdapterError) return unavailableResponse()
    const response = apiError(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const Route = createFileRoute('/api/research')({
  server: {
    handlers: {
      GET: ({ request }) => researchHandler(request),
      POST: ({ request }) => researchHandler(request),
    },
  },
})
