import '@tanstack/react-start/server-only'

import { Buffer } from 'node:buffer'

import {
  executeKimiStreamRequest,
  parseKimiStreamResponse,
  validateAdapterOptions,
} from '@/server/integrations/kimi/client'
import {
  type ImageInput,
  imageInputSchema,
  KIMI_DEFAULT_PROMPT,
  KIMI_MODEL,
  KIMI_RESPONSE_FORMAT,
  KIMI_THINKING,
  KimiAdapterError,
  type KimiAdapterOptions,
  type KimiPort,
  loadKimiConfig,
} from '@/server/integrations/kimi/contracts'

export function buildImageDataUrl(input: ImageInput): string {
  const parsed = imageInputSchema.safeParse(input)
  if (!parsed.success || parsed.data.image.byteLength === 0) {
    throw new KimiAdapterError('KIMI_INPUT_INVALID')
  }

  const base64 = Buffer.from(parsed.data.image).toString('base64')
  return `data:${parsed.data.mediaType};base64,${base64}`
}

export function createKimiAdapter(options: KimiAdapterOptions): KimiPort {
  const validated = validateAdapterOptions(options)

  return {
    async analyzeImage(input, analyzeOptions = {}) {
      const parsedInput = imageInputSchema.safeParse(input)
      if (!parsedInput.success || parsedInput.data.image.byteLength === 0) {
        throw new KimiAdapterError('KIMI_INPUT_INVALID')
      }

      const requestBody = {
        model: KIMI_MODEL,
        messages: [
          {
            role: 'user' as const,
            content: [
              {
                type: 'image_url' as const,
                image_url: {
                  url: buildImageDataUrl(parsedInput.data),
                },
              },
              {
                type: 'text' as const,
                text: parsedInput.data.prompt ?? KIMI_DEFAULT_PROMPT,
              },
            ],
          },
        ],
        response_format: KIMI_RESPONSE_FORMAT,
        stream: true as const,
        thinking: KIMI_THINKING,
      }

      return executeKimiStreamRequest(
        validated,
        requestBody,
        analyzeOptions.signal,
        parseKimiStreamResponse,
        analyzeOptions.onReasoning,
      )
    },
  }
}

export function createConfiguredKimiAdapter(
  input: NodeJS.ProcessEnv = process.env,
  options: Pick<KimiAdapterOptions, 'fetch' | 'baseUrl'> = {},
): KimiPort {
  const config = loadKimiConfig(input)
  if (!config.enabled || config.apiKey === undefined) {
    throw new KimiAdapterError('KIMI_LIVE_DISABLED')
  }

  return createKimiAdapter({
    apiKey: config.apiKey,
    baseUrl: options.baseUrl,
    fetch: options.fetch,
  })
}
