import { createFileRoute } from '@tanstack/react-router'

import { requireUser } from '@/server/auth'
import { apiError, assertTrustedMutation } from '@/server/http'
import {
  type AiInsight,
  generateInsightsWithKimi,
  getInsightsCapability,
  getInsightsResponse,
  type InsightsActivityEvent,
  type InsightsResponse,
} from '@/server/insights'
import { KimiAdapterError } from '@/server/integrations/kimi'

export type InsightsStreamEvent =
  | InsightsActivityEvent
  | { type: 'complete'; analysis: AiInsight }
  | { type: 'error'; message: string }

type InsightsHandlerDependencies = {
  authenticate?: (headers: Headers) => Promise<{ id: string }>
  get?: (userId: string) => Promise<InsightsResponse>
  generate?: (
    userId: string,
    report?: (event: InsightsActivityEvent) => void | Promise<void>,
  ) => Promise<AiInsight>
  capability?: () => boolean
}

function unavailableResponse() {
  return Response.json(
    {
      status: 'unavailable',
      error: 'El análisis con Kimi no está disponible en este momento.',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  )
}

function streamInsights(
  generate: NonNullable<InsightsHandlerDependencies['generate']>,
  userId: string,
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: InsightsStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        const analysis = await generate(userId, send)
        send({ type: 'complete', analysis })
      } catch (error) {
        send({
          type: 'error',
          message:
            error instanceof KimiAdapterError
              ? 'El análisis con Kimi no está disponible en este momento.'
              : 'No se pudo generar el análisis.',
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

export async function insightsHandler(
  request: Request,
  dependencies: InsightsHandlerDependencies = {},
) {
  try {
    const user = await (dependencies.authenticate ?? requireUser)(
      request.headers,
    )
    if (request.method === 'POST') {
      assertTrustedMutation(request)
      const available =
        dependencies.capability?.() ?? getInsightsCapability().kimi
      if (!available) return unavailableResponse()
      const generate = dependencies.generate ?? generateInsightsWithKimi
      if (request.headers.get('Accept')?.includes('text/event-stream')) {
        return streamInsights(generate, user.id)
      }
      return Response.json(
        { analysis: await generate(user.id) },
        { status: 201, headers: { 'Cache-Control': 'no-store' } },
      )
    }
    return Response.json(
      await (dependencies.get ?? getInsightsResponse)(user.id),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof KimiAdapterError) return unavailableResponse()
    const response = apiError(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const Route = createFileRoute('/api/insights')({
  server: {
    handlers: {
      GET: ({ request }) => insightsHandler(request),
      POST: ({ request }) => insightsHandler(request),
    },
  },
})
