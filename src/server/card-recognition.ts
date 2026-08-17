import '@tanstack/react-start/server-only'

import { z } from 'zod'

import {
  type ScanImageMediaType,
  validateScanImage,
} from '@/lib/image-validation'
import {
  KIMI_DEFAULT_PROMPT,
  KimiAdapterError,
  type KimiChatTool,
  type KimiReasoningEvent,
  type KimiVisionToolPort,
} from '@/server/integrations/kimi'
import { McpClientError, type McpToolClient } from '@/server/integrations/mcp'

type RecognitionMcpClient = Pick<
  McpToolClient,
  'listTools' | 'callTool' | 'close'
>

const getPokemonInputSchema = z
  .object({
    pokemonId: z.union([
      z.number().int().min(1).max(1025),
      z.string().trim().min(1).max(40),
    ]),
  })
  .strict()

const verifiedPokemonSchema = z
  .object({
    pokemonId: z.number().int().min(1).max(1025),
    name: z.string().trim().min(1).max(80),
    nameNormalized: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    sprite: z.string().url().nullable(),
    types: z.array(z.string().trim().min(1).max(24)).min(1).max(2),
    generation: z.string().trim().min(1).max(32),
  })
  .passthrough()

function getPokemonTool(
  tools: Awaited<ReturnType<RecognitionMcpClient['listTools']>>,
) {
  const tool = tools.find((entry) => entry.name === 'get_pokemon')
  if (tool === undefined) throw new McpClientError()
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description:
        tool.description ?? 'Read verified PokéAPI-backed Pokémon details.',
      parameters: tool.inputSchema,
    },
  } satisfies KimiChatTool
}

export type RecognitionCandidate = {
  pokemonId: number
  name: string
  sprite: string | null
  types: string[]
  generation: string
  evidence: Array<{
    label: string
    value: string
    source: 'Kimi' | 'PokéAPI'
  }>
}

export type RecognitionInput = {
  bytes: Uint8Array
  mediaType: ScanImageMediaType
  indication?: string
}

export type RecognitionActivityEvent = KimiReasoningEvent

export class RecognitionVerificationError extends Error {
  readonly status = 422

  constructor() {
    super('No se pudo verificar el candidato con PokéAPI.')
    this.name = 'RecognitionVerificationError'
  }
}

export function createCardRecognitionService(options: {
  kimi: KimiVisionToolPort
  createMcpClient: () => Promise<RecognitionMcpClient>
}) {
  return {
    async recognize(
      input: RecognitionInput,
      report?: (event: RecognitionActivityEvent) => void | Promise<void>,
      signal?: AbortSignal,
    ): Promise<RecognitionCandidate> {
      const validated = validateScanImage({
        bytes: input.bytes,
        declaredMediaType: input.mediaType,
      })
      const indication = input.indication?.trim()
      const mcp = await options.createMcpClient()
      try {
        const tool = getPokemonTool(await mcp.listTools())
        const toolCall = await options.kimi.analyzeImageWithTool(
          {
            image: validated.bytes,
            mediaType: validated.mediaType,
            ...(indication
              ? {
                  prompt: `${KIMI_DEFAULT_PROMPT}\nAdditional visual indication from the user: ${indication}`,
                }
              : {}),
          },
          tool,
          {
            signal,
            onReasoning: (delta) => report?.({ type: 'reasoning', delta }),
          },
        )
        let decodedInput: unknown
        try {
          decodedInput = JSON.parse(toolCall.arguments) as unknown
        } catch {
          throw new KimiAdapterError('KIMI_RESULT_INVALID')
        }
        const requested = getPokemonInputSchema.safeParse(decodedInput)
        if (!requested.success) {
          throw new KimiAdapterError('KIMI_RESULT_INVALID')
        }
        const result = await mcp.callTool('get_pokemon', requested.data)
        const verified = verifiedPokemonSchema.safeParse(result.data)
        if (!verified.success) throw new RecognitionVerificationError()
        const pokemon = verified.data

        return {
          pokemonId: pokemon.pokemonId,
          name: pokemon.name,
          sprite: pokemon.sprite,
          types: pokemon.types,
          generation: pokemon.generation,
          evidence: [
            {
              label: 'Identificación propuesta',
              value: String(requested.data.pokemonId),
              source: 'Kimi',
            },
            {
              label: 'Coincidencia de catálogo',
              value: `#${pokemon.pokemonId} ${pokemon.name} · ${pokemon.generation}`,
              source: 'PokéAPI',
            },
          ],
        }
      } finally {
        await mcp.close()
      }
    },
  }
}
