import '@tanstack/react-start/server-only'

import {
  executeKimiRequest,
  parseKimiChatResponse,
  validateAdapterOptions,
} from '@/server/integrations/kimi/client'
import {
  type InsightsProposalPort,
  insightsProposalInputSchema,
  KIMI_INSIGHTS_MAX_COMPLETION_TOKENS,
  KIMI_MODEL,
  KIMI_TEMPERATURE,
  KIMI_THINKING,
  KimiAdapterError,
  type KimiAdapterOptions,
  kimiNarrativeSchema,
  loadKimiConfig,
} from '@/server/integrations/kimi/contracts'

export function createKimiInsightsAdapter(
  options: KimiAdapterOptions,
): InsightsProposalPort {
  const validated = validateAdapterOptions(options)

  return {
    async propose(input, proposeOptions = {}) {
      const parsedInput = insightsProposalInputSchema.safeParse(input)
      if (!parsedInput.success) {
        throw new KimiAdapterError('KIMI_INPUT_INVALID')
      }
      const factKeys = parsedInput.data.facts.map((fact) => fact.key)
      if (new Set(factKeys).size !== factKeys.length) {
        throw new KimiAdapterError('KIMI_INPUT_INVALID')
      }
      return executeKimiRequest(
        validated,
        {
          model: KIMI_MODEL,
          messages: [
            {
              role: 'user' as const,
              content: [
                'Escribe un análisis narrativo de esta colección Pokémon en español neutral.',
                'No devuelvas JSON ni una estructura de campos. Explica con libertad qué patrones, tensiones o posibilidades ves en los hechos.',
                'Usa únicamente los hechos proporcionados. No inventes métricas, Pokémon, preferencias ni causalidad. Los hechos se mostrarán por separado como evidencia calculada.',
                JSON.stringify(parsedInput.data),
              ].join('\n'),
            },
          ],
          stream: false as const,
          thinking: KIMI_THINKING,
          temperature: KIMI_TEMPERATURE,
          max_completion_tokens: KIMI_INSIGHTS_MAX_COMPLETION_TOKENS,
        },
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

export function createConfiguredKimiInsightsAdapter(
  input: NodeJS.ProcessEnv = process.env,
  options: Pick<KimiAdapterOptions, 'fetch' | 'baseUrl'> = {},
): InsightsProposalPort {
  const config = loadKimiConfig(input)
  if (!config.enabled || config.apiKey === undefined) {
    throw new KimiAdapterError('KIMI_LIVE_DISABLED')
  }

  return createKimiInsightsAdapter({
    apiKey: config.apiKey,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
    timeoutMs: config.timeoutMs,
  })
}
