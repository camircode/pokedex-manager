import '@tanstack/react-start/server-only'

import {
  executeKimiStreamRequest,
  parseKimiStreamChatResponse,
  validateAdapterOptions,
} from '@/server/integrations/kimi/client'
import {
  KIMI_MODEL,
  KIMI_THINKING,
  KimiAdapterError,
  type KimiAdapterOptions,
  kimiNarrativeSchema,
  loadKimiConfig,
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
              'Habla directamente con la persona sobre su colección de Pokémon. Escribe en español claro, cotidiano y fácil de entender.',
              'Usa dos párrafos cortos. En el primero, resume qué tiene hoy la colección. En el segundo, recomienda un siguiente paso concreto.',
              'Usa frases simples y palabras comunes como “tu colección”, “tienes” y “te falta”. Evita el tono académico, burocrático o grandilocuente y no uses palabras como “acervo”, “germinal”, “singularidad”, “panorama”, “tipológico” o “sistemático”.',
              'Menciona como máximo tres tipos ausentes. Devuelve solo el texto final, sin título, etiquetas, listas ni explicaciones sobre estas instrucciones.',
              'Usa únicamente el estado y las posibilidades proporcionadas. No inventes criterios, progreso, enlaces ni datos personales. El servidor calcula y valida los objetivos por separado.',
              JSON.stringify(parsedInput.data),
            ].join('\n'),
          },
        ],
        stream: true as const,
        thinking: KIMI_THINKING,
      }

      return executeKimiStreamRequest(
        validated,
        requestBody,
        proposeOptions.signal,
        (payload) => {
          const parsed = kimiNarrativeSchema.safeParse(
            parseKimiStreamChatResponse(payload).content,
          )
          if (!parsed.success) {
            throw new KimiAdapterError('KIMI_RESULT_INVALID')
          }
          return parsed.data
        },
        proposeOptions.onReasoning,
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
  })
}
