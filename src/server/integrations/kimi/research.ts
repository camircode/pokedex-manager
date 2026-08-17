import '@tanstack/react-start/server-only'

import {
  executeKimiRequest,
  parseKimiChatResponse,
  validateAdapterOptions,
} from '@/server/integrations/kimi/client'
import {
  KIMI_MODEL,
  KIMI_RESEARCH_MAX_COMPLETION_TOKENS,
  KIMI_TEMPERATURE,
  KIMI_THINKING,
  KimiAdapterError,
  type KimiAdapterOptions,
  loadKimiConfig,
  kimiNarrativeSchema,
  type ResearchProposalPort,
  researchProposalInputSchema,
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
              'Escribe una propuesta narrativa de investigación de colección en español neutral.',
              'No devuelvas JSON ni una estructura de campos. Redacta una pieza breve, con libertad para desarrollar la idea y el siguiente paso de la colección.',
              'Usa únicamente el estado y las posibilidades proporcionadas. No inventes criterios, progreso, enlaces ni datos personales. Los objetivos verificables se calculan y validan por separado en el servidor.',
              JSON.stringify(parsedInput.data),
            ].join('\n'),
          },
        ],
        stream: false as const,
        thinking: KIMI_THINKING,
        temperature: KIMI_TEMPERATURE,
        max_completion_tokens: KIMI_RESEARCH_MAX_COMPLETION_TOKENS,
      }

      return executeKimiRequest(
        validated,
        requestBody,
        proposeOptions.signal,
        (payload) => {
          const parsed = kimiNarrativeSchema.safeParse(
            parseKimiChatResponse(payload).content,
          )
          if (!parsed.success) {
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
