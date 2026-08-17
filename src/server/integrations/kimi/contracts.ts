import '@tanstack/react-start/server-only'

import { z } from 'zod'

export const KIMI_MODEL = 'kimi-k2.6' as const
export const KIMI_API_BASE_URL = 'https://api.moonshot.ai/v1'
export const KIMI_DEFAULT_TIMEOUT_MS = 60_000
export const KIMI_VISION_DEFAULT_TIMEOUT_MS = 30_000
export const KIMI_TEMPERATURE = 1
export const KIMI_THINKING = { type: 'enabled' } as const
// Thinking tokens are part of max_completion_tokens, so every response needs
// enough headroom for reasoning before its visible content.
export const KIMI_MAX_COMPLETION_TOKENS = 1_024
export const KIMI_RESEARCH_MAX_COMPLETION_TOKENS = 2_048
export const KIMI_INSIGHTS_MAX_COMPLETION_TOKENS = 2_048
export const KIMI_ASSISTANT_MAX_COMPLETION_TOKENS = 4_096
export const KIMI_DEFAULT_PROMPT =
  'Identify the Pokémon in this image. Return only the requested JSON.'

export const KIMI_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'pokemon_identification',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        pokemonId: { type: 'integer' },
        name: {
          type: 'string',
          minLength: 1,
          maxLength: 32,
          pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
          description: 'Canonical lowercase Pokémon name or slug.',
        },
      },
      required: ['pokemonId', 'name'],
      additionalProperties: false,
    },
  },
} as const

const nonEmptyString = z.string().trim().min(1)
const timeoutSchema = (defaultTimeoutMs: number) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/)
    .default(String(defaultTimeoutMs))
    .transform(Number)
    .refine((value) => value >= 100 && value <= 120_000)

const kimiEnvironmentSchema = z.object({
  KIMI_LIVE_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  MOONSHOT_API_KEY: z.preprocess(
    (value) => (value === '' ? undefined : value),
    nonEmptyString.optional(),
  ),
  KIMI_TIMEOUT_MS: timeoutSchema(KIMI_DEFAULT_TIMEOUT_MS),
  KIMI_VISION_TIMEOUT_MS: timeoutSchema(KIMI_VISION_DEFAULT_TIMEOUT_MS),
})

export const imageMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
])

export const imageInputSchema = z
  .object({
    image: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
    mediaType: imageMediaTypeSchema,
    prompt: nonEmptyString.max(400).optional(),
  })
  .strict()

export const kimiResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({ content: z.unknown().optional() }),
      }),
    )
    .min(1),
})

const kimiToolCallSchema = z
  .object({
    index: z.number().int().nonnegative().optional(),
    id: z.string().trim().min(1).max(128),
    type: z.literal('function'),
    function: z
      .object({
        name: z.string().trim().min(1).max(64),
        arguments: z.string().max(2_000),
      })
      .strict(),
  })
  .strict()

export const kimiChatResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string(),
        message: z.object({
          content: z.unknown().optional(),
          tool_calls: z.array(kimiToolCallSchema).max(10).optional(),
        }),
      }),
    )
    .min(1),
})

const pokemonNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .transform((value) =>
    value
      .normalize('NFKD')
      .toLowerCase()
      .replace(/♀/g, '-f')
      .replace(/♂/g, '-m')
      .replace(/['’.]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, ''),
  )
  .pipe(
    z
      .string()
      .min(1)
      .max(32)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  )

export const kimiPokemonResultSchema = z
  .object({
    pokemonId: z.number().int().min(1).max(1025),
    name: pokemonNameSchema,
  })
  .strict()

export type KimiPokemonResult = z.infer<typeof kimiPokemonResultSchema>

export type ImageInput = {
  image: Uint8Array
  mediaType: KimiImageMediaType
  prompt?: string
}

export type KimiImageMediaType = z.infer<typeof imageMediaTypeSchema>

export type KimiAnalyzeOptions = {
  signal?: AbortSignal
}

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

export type KimiAdapterOptions = {
  apiKey: string
  baseUrl?: string
  timeoutMs?: number
  fetch?: FetchImplementation
}

const researchAggregateSchema = z
  .object({
    uniqueCount: z.number().int().min(0).max(1025),
    representedTypes: z.array(z.string().trim().min(1).max(24)).max(24),
    missingTypes: z.array(z.string().trim().min(1).max(24)).max(24),
    representedGenerations: z.array(z.string().trim().min(1).max(32)).max(12),
  })
  .strict()

const researchCandidateSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(120),
  })
  .strict()

export const researchProposalInputSchema = z
  .object({
    aggregate: researchAggregateSchema,
    candidates: z.array(researchCandidateSchema).min(2).max(6),
  })
  .strict()

const insightFactSchema = z
  .object({
    key: z.string().trim().min(1).max(64),
    label: z.string().trim().min(1).max(80),
    fact: z.string().trim().min(1).max(240),
  })
  .strict()

export const insightsProposalInputSchema = z
  .object({ facts: z.array(insightFactSchema).min(2).max(8) })
  .strict()

export const kimiNarrativeSchema = z.string().trim().min(20).max(8_000)

export type ResearchProposalInput = z.infer<typeof researchProposalInputSchema>
export type ResearchProposal = string

export interface ResearchProposalPort {
  propose(
    input: ResearchProposalInput,
    options?: KimiAnalyzeOptions,
  ): Promise<ResearchProposal>
}

export type InsightsProposalInput = z.infer<typeof insightsProposalInputSchema>
export type InsightsProposal = string

export interface InsightsProposalPort {
  propose(
    input: InsightsProposalInput,
    options?: KimiAnalyzeOptions,
  ): Promise<InsightsProposal>
}

export type KimiToolCall = {
  id: string
  name: string
  arguments: string
}

export type KimiChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: KimiToolCall[] }
  | {
      role: 'tool'
      content: string
      name: string
      toolCallId: string
    }

export type KimiChatTool = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export type KimiChatCompletion = {
  finishReason: 'stop' | 'tool_calls'
  content: string
  toolCalls: KimiToolCall[]
}

export interface KimiChatPort {
  complete(
    input: { messages: KimiChatMessage[]; tools: KimiChatTool[] },
    options?: KimiAnalyzeOptions,
  ): Promise<KimiChatCompletion>
}

export interface KimiPort {
  analyzeImage(
    input: ImageInput,
    options?: KimiAnalyzeOptions,
  ): Promise<KimiPokemonResult>
}

export type KimiConfig = {
  enabled: boolean
  apiKey?: string
  timeoutMs: number
  visionTimeoutMs: number
}

export type KimiErrorCode =
  | 'KIMI_ABORTED'
  | 'KIMI_CONFIG_INVALID'
  | 'KIMI_CONTENT_MISSING'
  | 'KIMI_FINISH_REASON_INVALID'
  | 'KIMI_HTTP_STATUS'
  | 'KIMI_INPUT_INVALID'
  | 'KIMI_JSON_INVALID'
  | 'KIMI_LIVE_DISABLED'
  | 'KIMI_REQUEST_FAILED'
  | 'KIMI_RESPONSE_INVALID'
  | 'KIMI_RESPONSE_TRUNCATED'
  | 'KIMI_RESULT_INVALID'
  | 'KIMI_TIMEOUT'

const errorMessages: Record<KimiErrorCode, string> = {
  KIMI_ABORTED: 'Kimi request was aborted',
  KIMI_CONFIG_INVALID: 'Invalid Kimi server configuration',
  KIMI_CONTENT_MISSING: 'Kimi response content is missing',
  KIMI_FINISH_REASON_INVALID: 'Kimi response has an unsupported finish reason',
  KIMI_HTTP_STATUS: 'Kimi provider returned an unsuccessful status',
  KIMI_INPUT_INVALID: 'Invalid Kimi image input',
  KIMI_JSON_INVALID: 'Kimi response content is not valid JSON',
  KIMI_LIVE_DISABLED: 'Kimi live integration is disabled',
  KIMI_REQUEST_FAILED: 'Kimi request failed',
  KIMI_RESPONSE_INVALID: 'Invalid Kimi provider response',
  KIMI_RESPONSE_TRUNCATED: 'Kimi response was truncated',
  KIMI_RESULT_INVALID: 'Kimi result failed domain validation',
  KIMI_TIMEOUT: 'Kimi request timed out',
}

export class KimiAdapterError extends Error {
  readonly code: KimiErrorCode
  readonly status: number | undefined

  constructor(code: KimiErrorCode, status?: number) {
    super(errorMessages[code])
    this.name = 'KimiAdapterError'
    this.code = code
    this.status = status
  }
}

export function loadKimiConfig(
  input: NodeJS.ProcessEnv = process.env,
): KimiConfig {
  const parsed = kimiEnvironmentSchema.safeParse(input)
  if (!parsed.success) throw new KimiAdapterError('KIMI_CONFIG_INVALID')

  if (
    parsed.data.KIMI_LIVE_ENABLED &&
    parsed.data.MOONSHOT_API_KEY === undefined
  ) {
    throw new KimiAdapterError('KIMI_CONFIG_INVALID')
  }

  return {
    enabled: parsed.data.KIMI_LIVE_ENABLED,
    apiKey: parsed.data.MOONSHOT_API_KEY,
    timeoutMs: parsed.data.KIMI_TIMEOUT_MS,
    visionTimeoutMs: parsed.data.KIMI_VISION_TIMEOUT_MS,
  }
}
