import '@tanstack/react-start/server-only'

import { Buffer } from 'node:buffer'

import {
  executeKimiStreamRequest,
  parseKimiStreamResponse,
  parseKimiStreamToolResponse,
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
  type KimiVisionToolPort,
  loadKimiConfig,
} from '@/server/integrations/kimi/contracts'

const KIMI_VISION_SYSTEM_PROMPT =
  'Identify the Pokémon species shown in the card image. The final response must be exactly one JSON object with keys "pokemonId" and "name", for example {"pokemonId":151,"name":"mew"}. "pokemonId" is the National Pokédex integer, not a card or set number. "name" is the canonical lowercase PokéAPI base-species slug. Ignore owner prefixes and card mechanics or labels such as ex, EX, GX, V, VMAX, VSTAR, Mega, and Radiant. Do not add prose, Markdown, or other keys.'

const KIMI_VISION_TOOL_SYSTEM_PROMPT =
  'Identify the base Pokémon species shown in the card image, then call the provided get_pokemon tool exactly once to verify it against the Pokédex catalog. Use the National Pokédex integer or canonical base-species name, never a card or set number. Ignore owner prefixes and card mechanics or labels such as ex, EX, GX, V, VMAX, VSTAR, Mega, and Radiant. Do not answer with JSON or prose; the tool result is the authoritative answer.'

export function buildImageDataUrl(input: ImageInput): string {
  const parsed = imageInputSchema.safeParse(input)
  if (!parsed.success || parsed.data.image.byteLength === 0) {
    throw new KimiAdapterError('KIMI_INPUT_INVALID')
  }

  const base64 = Buffer.from(parsed.data.image).toString('base64')
  return `data:${parsed.data.mediaType};base64,${base64}`
}

export function createKimiAdapter(
  options: KimiAdapterOptions,
): KimiPort & KimiVisionToolPort {
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
            role: 'system' as const,
            content: KIMI_VISION_SYSTEM_PROMPT,
          },
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

    async analyzeImageWithTool(input, tool, analyzeOptions = {}) {
      const parsedInput = imageInputSchema.safeParse(input)
      if (
        !parsedInput.success ||
        parsedInput.data.image.byteLength === 0 ||
        tool.function.name !== 'get_pokemon'
      ) {
        throw new KimiAdapterError('KIMI_INPUT_INVALID')
      }

      const result = await executeKimiStreamRequest(
        validated,
        {
          model: KIMI_MODEL,
          messages: [
            {
              role: 'system' as const,
              content: KIMI_VISION_TOOL_SYSTEM_PROMPT,
            },
            {
              role: 'user' as const,
              content: [
                {
                  type: 'image_url' as const,
                  image_url: { url: buildImageDataUrl(parsedInput.data) },
                },
                {
                  type: 'text' as const,
                  text: parsedInput.data.prompt ?? KIMI_DEFAULT_PROMPT,
                },
              ],
            },
          ],
          tools: [tool],
          stream: true as const,
          thinking: KIMI_THINKING,
        },
        analyzeOptions.signal,
        parseKimiStreamToolResponse,
        analyzeOptions.onReasoning,
      )
      if (result.name !== tool.function.name) {
        throw new KimiAdapterError('KIMI_RESULT_INVALID')
      }
      return result
    },
  }
}

export function createConfiguredKimiAdapter(
  input: NodeJS.ProcessEnv = process.env,
  options: Pick<KimiAdapterOptions, 'fetch' | 'baseUrl'> = {},
): KimiPort & KimiVisionToolPort {
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
