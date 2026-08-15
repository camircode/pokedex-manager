import '@tanstack/react-start/server-only'

import {
  decodeKimiContent,
  executeKimiRequest,
  validateAdapterOptions,
} from '@/server/integrations/kimi/client'
import {
  type InsightsProposalPort,
  insightsProposalInputSchema,
  insightsProposalSchema,
  KIMI_INSIGHTS_MAX_COMPLETION_TOKENS,
  KIMI_INSIGHTS_RESPONSE_FORMAT,
  KIMI_MODEL,
  KimiAdapterError,
  type KimiAdapterOptions,
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
                'Interpreta esta colección Pokémon en español neutral.',
                'Usa únicamente los hechos proporcionados. No inventes métricas, Pokémon, preferencias ni causalidad.',
                'Selecciona entre 2 y 4 factKey distintos y explica qué significa cada hecho para la colección.',
                JSON.stringify(parsedInput.data),
              ].join('\n'),
            },
          ],
          response_format: KIMI_INSIGHTS_RESPONSE_FORMAT,
          stream: false as const,
          thinking: { type: 'disabled' as const },
          temperature: 0.6,
          max_completion_tokens: KIMI_INSIGHTS_MAX_COMPLETION_TOKENS,
        },
        proposeOptions.signal,
        (payload) => {
          const parsed = insightsProposalSchema.safeParse(
            decodeKimiContent(payload),
          )
          if (!parsed.success) {
            throw new KimiAdapterError('KIMI_RESULT_INVALID')
          }
          const selected = parsed.data.findings.map(
            (finding) => finding.factKey,
          )
          if (
            new Set(selected).size !== selected.length ||
            selected.some((key) => !factKeys.includes(key))
          ) {
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
