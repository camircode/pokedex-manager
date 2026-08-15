import '@tanstack/react-start/server-only'

import {
  type ScanImageMediaType,
  validateScanImage,
} from '@/lib/image-validation'
import type { PokemonRecord } from '@/server/catalog'
import type { KimiPort } from '@/server/integrations/kimi'

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

export type RecognitionActivityPhase =
  | 'validating'
  | 'identifying'
  | 'verifying'

export type RecognitionActivityEvent = {
  type: 'phase'
  phase: RecognitionActivityPhase
}

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
      input: {
        bytes: Uint8Array
        mediaType: ScanImageMediaType
      },
      report?: (event: RecognitionActivityEvent) => void | Promise<void>,
    ): Promise<RecognitionCandidate> {
      await report?.({ type: 'phase', phase: 'validating' })
      const validated = validateScanImage({
        bytes: input.bytes,
        declaredMediaType: input.mediaType,
      })
      await report?.({ type: 'phase', phase: 'identifying' })
      const identified = await options.kimi.analyzeImage({
        image: validated.bytes,
        mediaType: validated.mediaType,
      })
      await report?.({ type: 'phase', phase: 'verifying' })
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
