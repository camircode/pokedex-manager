import '@tanstack/react-start/server-only'

import { z } from 'zod'

import type { KIMI_MODEL } from '@/server/integrations/kimi'
import type { KimiReasoningEvent } from '@/server/integrations/kimi'
import type { McpToolName } from '@/server/integrations/mcp'

export const MAX_ASSISTANT_TOOL_OPERATIONS = 6
export const MAX_ASSISTANT_CONTEXT_MESSAGES = 20

export const assistantInputSchema = z
  .object({
    message: z.string().trim().min(1).max(500),
    conversationId: z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .optional(),
  })
  .strict()

export const conversationQuerySchema = z.object({
  conversationId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
})

export type AssistantCitation = {
  id: number
  label: string
  source: 'PokéAPI' | 'Colección' | 'Estadísticas' | 'Investigación'
  fact: string
  href?: string
}

export type AssistantToolName = McpToolName

export type AssistantToolOperation = {
  name: AssistantToolName
  input: Record<string, unknown>
}

export type AssistantCapability = {
  kimi: boolean
  mcp: true
  model: typeof KIMI_MODEL
}

export type AssistantActivityEvent =
  | KimiReasoningEvent
  | { type: 'status'; phase: 'thinking' | 'writing' }
  | { type: 'tool_call'; operation: AssistantToolOperation }
  | {
      type: 'tool_result'
      operation: AssistantToolOperation
      citations: AssistantCitation[]
    }

export type AssistantMessage = {
  id: string
  conversationId: string
  userId: string
  role: 'user' | 'assistant'
  content: string
  citations: AssistantCitation[]
  toolCalls: AssistantToolOperation[]
  createdAt: Date
}

export type AssistantConversation = {
  id: string
  userId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

export type AssistantContextMessage = Pick<AssistantMessage, 'role' | 'content'>

export type AssistantStreamEvent =
  | AssistantActivityEvent
  | {
      type: 'complete'
      conversationId: string
      message: AssistantMessage
    }
  | { type: 'error'; message: string }

export type AssistantActivityReporter = (
  event: AssistantActivityEvent,
) => void | Promise<void>

export const assistantToolOperationSchema = z.discriminatedUnion('name', [
  z
    .object({
      name: z.literal('search_pokemon'),
      input: z
        .object({
          query: z.string().trim().min(1).max(40),
          limit: z.number().int().min(1).max(20).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('get_pokemon'),
      input: z
        .object({
          pokemonId: z.union([
            z.number().int().min(1).max(1025),
            z.string().trim().min(1).max(40),
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('list_my_collection'),
      input: z
        .object({ limit: z.number().int().min(1).max(100).optional() })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('get_collection_stats'),
      input: z.object({}).strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('compare_pokemon'),
      input: z
        .object({
          leftId: z.union([
            z.number().int().min(1).max(1025),
            z.string().trim().min(1).max(40),
          ]),
          rightId: z.union([
            z.number().int().min(1).max(1025),
            z.string().trim().min(1).max(40),
          ]),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      name: z.literal('get_research_progress'),
      input: z.object({}).strict(),
    })
    .strict(),
])

export class AssistantNotFoundError extends Error {
  readonly status = 404

  constructor() {
    super('Conversación no encontrada.')
    this.name = 'AssistantNotFoundError'
  }
}

export class AssistantToolLimitError extends Error {
  readonly status = 400

  constructor() {
    super('La solicitud requiere demasiadas operaciones.')
    this.name = 'AssistantToolLimitError'
  }
}
