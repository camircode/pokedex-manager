import '@tanstack/react-start/server-only'

import {
  decodeKimiContent,
  executeKimiRequest,
  validateAdapterOptions,
} from '@/server/integrations/kimi/client'
import {
  KIMI_MODEL,
  KIMI_RESEARCH_MAX_COMPLETION_TOKENS,
  KIMI_RESEARCH_RESPONSE_FORMAT,
  KimiAdapterError,
  type KimiAdapterOptions,
  loadKimiConfig,
  type ResearchProposalPort,
  researchProposalInputSchema,
  researchProposalSchema,
} from '@/server/integrations/kimi/contracts'

export function createKimiResearchAdapter(
  options: KimiAdapterOptions,
): ResearchProposalPort {
  const validated = validateAdapterOptions(options)

  return {
    async propose(input, proposeOptions = {}) {
      const parsedInput = researchProposalInputSchema.safeParse(input)
      if (!parsedInput.success) {
        throw new KimiAdapterError('KIMI_INPUT_INVALID')
      }
      const candidateKeys = parsedInput.data.candidates.map(
        (candidate) => candidate.key,
      )
      if (new Set(candidateKeys).size !== candidateKeys.length) {
        throw new KimiAdapterError('KIMI_INPUT_INVALID')
      }

      const requestBody = {
        model: KIMI_MODEL,
        messages: [
          {
            role: 'user' as const,
            content: [
              'Propón una expedición de colección en español neutral.',
              'Crea solo un título de hasta 80 caracteres y una premisa de hasta 240 caracteres, y elige 2 o 3 objectiveKeys de la lista exacta.',
              'No inventes criterios, progreso, enlaces ni datos personales.',
              JSON.stringify(parsedInput.data),
            ].join('\n'),
          },
        ],
        response_format: KIMI_RESEARCH_RESPONSE_FORMAT,
        stream: false as const,
        thinking: { type: 'disabled' as const },
        temperature: 0.6,
        max_completion_tokens: KIMI_RESEARCH_MAX_COMPLETION_TOKENS,
      }

      return executeKimiRequest(
        validated,
        requestBody,
        proposeOptions.signal,
        (payload) => {
          const parsed = researchProposalSchema.safeParse(
            decodeKimiContent(payload),
          )
          if (!parsed.success) {
            throw new KimiAdapterError('KIMI_RESULT_INVALID')
          }
          const selected = parsed.data.objectiveKeys
          if (
            new Set(selected).size !== selected.length ||
            selected.some((key) => !candidateKeys.includes(key))
          ) {
            throw new KimiAdapterError('KIMI_RESULT_INVALID')
          }
          return parsed.data
        },
      )
    },
  }
}

export function createConfiguredKimiResearchAdapter(
  input: NodeJS.ProcessEnv = process.env,
  options: Pick<KimiAdapterOptions, 'fetch' | 'baseUrl'> = {},
): ResearchProposalPort {
  const config = loadKimiConfig(input)
  if (!config.enabled || config.apiKey === undefined) {
    throw new KimiAdapterError('KIMI_LIVE_DISABLED')
  }

  return createKimiResearchAdapter({
    apiKey: config.apiKey,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    timeoutMs: config.timeoutMs,
  })
}
