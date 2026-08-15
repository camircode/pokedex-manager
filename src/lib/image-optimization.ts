import {
  MAX_SCAN_IMAGE_BYTES,
  SCAN_IMAGE_MEDIA_TYPES,
} from '@/lib/image-validation'

const OUTPUT_MEDIA_TYPE = 'image/webp'
const INITIAL_MAX_DIMENSION = 2_560
const MIN_MAX_DIMENSION = 640
const INITIAL_QUALITY = 0.86
const MIN_QUALITY = 0.46
const MAX_ATTEMPTS = 8

type EncodeOptions = {
  maxDimension: number
  mediaType: typeof OUTPUT_MEDIA_TYPE
  quality: number
}

export type ScanImageEncoder = {
  encode(options: EncodeOptions): Promise<Blob>
  close(): void
}

export type ScanImageEncoderFactory = (file: File) => Promise<ScanImageEncoder>

export class ImageOptimizationError extends Error {
  constructor() {
    super('No se pudo preparar la imagen. Intenta con otra foto.')
    this.name = 'ImageOptimizationError'
  }
}

function optimizedFileName(name: string) {
  const base = name.replace(/\.[^.]+$/, '') || 'carta'
  return `${base}.webp`
}

function canvasBlob(
  canvas: HTMLCanvasElement,
  mediaType: string,
  quality: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob === null) reject(new ImageOptimizationError())
        else resolve(blob)
      },
      mediaType,
      quality,
    )
  })
}

async function loadHtmlImage(file: File) {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = () => reject(new ImageOptimizationError())
      image.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

async function createBrowserImageEncoder(
  file: File,
): Promise<ScanImageEncoder> {
  const source =
    typeof createImageBitmap === 'function'
      ? await createImageBitmap(file)
      : await loadHtmlImage(file)
  const width = source.width
  const height = source.height

  return {
    async encode({ maxDimension, mediaType, quality }) {
      const scale = Math.min(1, maxDimension / Math.max(width, height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(width * scale))
      canvas.height = Math.max(1, Math.round(height * scale))
      const context = canvas.getContext('2d')
      if (context === null) throw new ImageOptimizationError()
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(source, 0, 0, canvas.width, canvas.height)
      return canvasBlob(canvas, mediaType, quality)
    },
    close() {
      if ('close' in source && typeof source.close === 'function')
        source.close()
    },
  }
}

export async function optimizeScanImage(
  file: File,
  createEncoder: ScanImageEncoderFactory = createBrowserImageEncoder,
) {
  if (
    !SCAN_IMAGE_MEDIA_TYPES.includes(
      file.type as (typeof SCAN_IMAGE_MEDIA_TYPES)[number],
    )
  ) {
    return file
  }
  if (file.size <= MAX_SCAN_IMAGE_BYTES) return file

  let encoder: ScanImageEncoder | undefined
  try {
    encoder = await createEncoder(file)
    let maxDimension = INITIAL_MAX_DIMENSION
    let quality = INITIAL_QUALITY
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const blob = await encoder.encode({
        maxDimension,
        mediaType: OUTPUT_MEDIA_TYPE,
        quality,
      })
      if (blob.size <= MAX_SCAN_IMAGE_BYTES) {
        return new File([blob], optimizedFileName(file.name), {
          type: blob.type,
          lastModified: file.lastModified,
        })
      }
      maxDimension = Math.max(
        MIN_MAX_DIMENSION,
        Math.round(maxDimension * 0.78),
      )
      quality = Math.max(MIN_QUALITY, quality - 0.07)
    }
  } catch {
    throw new ImageOptimizationError()
  } finally {
    encoder?.close()
  }
  throw new ImageOptimizationError()
}
