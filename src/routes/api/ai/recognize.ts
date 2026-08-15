import { createFileRoute } from '@tanstack/react-router'

import {
  ImageValidationError,
  MAX_SCAN_IMAGE_BYTES,
  validateScanImage,
} from '@/lib/image-validation'
import { requireUser } from '@/server/auth'
import {
  createCardRecognitionService,
  type RecognitionActivityEvent,
  type RecognitionCandidate,
} from '@/server/card-recognition'
import { getCatalogService } from '@/server/catalog'
import {
  apiError,
  assertTrustedMutation,
  readFormDataBody,
} from '@/server/http'
import {
  createConfiguredKimiAdapter,
  KimiAdapterError,
} from '@/server/integrations/kimi'

const MAX_MULTIPART_BYTES = MAX_SCAN_IMAGE_BYTES + 128 * 1024

type RecognizeHandlerDependencies = {
  authenticate?: (headers: Headers) => Promise<{ id: string }>
  recognize?: ReturnType<typeof createCardRecognitionService>['recognize']
}

export type RecognitionStreamEvent =
  | RecognitionActivityEvent
  | { type: 'complete'; candidate: RecognitionCandidate }
  | { type: 'error'; message: string }

function unavailable() {
  return Response.json(
    {
      status: 'unavailable',
      error: 'El reconocimiento visual no está disponible en este momento.',
    },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  )
}

function streamRecognition(
  recognize: NonNullable<RecognizeHandlerDependencies['recognize']>,
  input: Parameters<NonNullable<RecognizeHandlerDependencies['recognize']>>[0],
) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: RecognitionStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      try {
        const candidate = await recognize(input, send)
        send({ type: 'complete', candidate })
      } catch (error) {
        send({
          type: 'error',
          message:
            error instanceof KimiAdapterError
              ? 'El reconocimiento visual no está disponible en este momento.'
              : error instanceof Error && 'status' in error
                ? error.message
                : 'No se pudo analizar la imagen.',
        })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

export async function recognizeHandler(
  request: Request,
  dependencies: RecognizeHandlerDependencies = {},
) {
  try {
    await (dependencies.authenticate ?? requireUser)(request.headers)
    assertTrustedMutation(request)
    if (
      !request.headers.get('content-type')?.startsWith('multipart/form-data')
    ) {
      throw new ImageValidationError('Envía la imagen como formulario.')
    }
    let form: FormData
    try {
      form = await readFormDataBody(request, MAX_MULTIPART_BYTES)
    } catch (error) {
      if (error instanceof Error && 'status' in error) throw error
      throw new ImageValidationError('No se pudo leer la imagen enviada.')
    }
    if (form.get('consent') !== 'true') {
      throw new ImageValidationError(
        'Debes autorizar el envío temporal de la imagen.',
      )
    }
    const image = form.get('image')
    if (!(image instanceof File)) {
      throw new ImageValidationError('Selecciona una imagen para analizar.')
    }
    const validated = validateScanImage({
      bytes: new Uint8Array(await image.arrayBuffer()),
      declaredMediaType: image.type,
    })

    let recognize = dependencies.recognize
    if (recognize === undefined) {
      const kimi = createConfiguredKimiAdapter()
      recognize = createCardRecognitionService({
        kimi,
        catalog: await getCatalogService(),
      }).recognize
    }
    const recognitionInput = {
      bytes: validated.bytes,
      mediaType: validated.mediaType,
    }
    if (request.headers.get('Accept')?.includes('text/event-stream')) {
      return streamRecognition(recognize, recognitionInput)
    }
    const candidate = await recognize(recognitionInput)
    return Response.json(
      { status: 'candidate', candidate },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    if (error instanceof KimiAdapterError) return unavailable()
    const response = apiError(error)
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

export const Route = createFileRoute('/api/ai/recognize')({
  server: {
    handlers: { POST: ({ request }) => recognizeHandler(request) },
  },
})
