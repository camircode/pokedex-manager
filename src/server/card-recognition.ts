import '@tanstack/react-start/server-only'

import {
  type ScanImageMediaType,
  validateScanImage,
} from '@/lib/image-validation'
import type { PokemonRecord } from '@/server/catalog'
import {
  KIMI_DEFAULT_PROMPT,
  type KimiPort,
  type KimiReasoningEvent,
} from '@/server/integrations/kimi'

type CatalogReader = {
  getPokemon(identifier: string | number): Promise<PokemonRecord>
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
  kimi: KimiPort
  catalog: CatalogReader
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
      const identified = await options.kimi.analyzeImage(
        {
          image: validated.bytes,
          mediaType: validated.mediaType,
          ...(indication
            ? {
                prompt: `${KIMI_DEFAULT_PROMPT}\nAdditional visual indication from the user: ${indication}`,
              }
            : {}),
        },
        {
          signal,
          onReasoning: (delta) => report?.({ type: 'reasoning', delta }),
        },
      )
      const [pokemonById, pokemonByName] = await Promise.all([
        options.catalog.getPokemon(identified.pokemonId),
        options.catalog.getPokemon(identified.name),
      ])

      if (
        pokemonById.pokemonId !== pokemonByName.pokemonId ||
        pokemonById.nameNormalized !== identified.name
      ) {
        throw new RecognitionVerificationError()
      }

      return {
        pokemonId: pokemonById.pokemonId,
        name: pokemonById.name,
        sprite: pokemonById.sprite,
        types: pokemonById.types,
        generation: pokemonById.generation,
        evidence: [
          {
            label: 'Identificación propuesta',
            value: `#${pokemonById.pokemonId} ${identified.name}`,
            source: 'Kimi',
          },
          {
            label: 'Coincidencia de catálogo',
            value: `${pokemonById.name} · ${pokemonById.generation}`,
            source: 'PokéAPI',
          },
        ],
      }
    },
  }
}
