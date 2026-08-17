import { createFileRoute } from '@tanstack/react-router'

import { requireUser } from '@/server/auth'
import { createEventStreamResponse } from '@/server/event-stream-response'
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
    signal?: AbortSignal,
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
  return createEventStreamResponse<InsightsStreamEvent>(
    async (send, signal) => {
      try {
        const analysis = await generate(userId, send, signal)
        send({ type: 'complete', analysis })
      } catch (error) {
        send({
          type: 'error',
          message:
            error instanceof KimiAdapterError
              ? 'El análisis con Kimi no está disponible en este momento.'
              : 'No se pudo generar el análisis.',
        })
      }
    },
  )
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
        { analysis: await generate(user.id, undefined, request.signal) },
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
