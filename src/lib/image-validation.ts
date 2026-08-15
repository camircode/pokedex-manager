export const MAX_SCAN_IMAGE_BYTES = 5 * 1024 * 1024

export const SCAN_IMAGE_MEDIA_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const

export type ScanImageMediaType = (typeof SCAN_IMAGE_MEDIA_TYPES)[number]

export class ImageValidationError extends Error {
  readonly status = 400

  constructor(message: string) {
    super(message)
    this.name = 'ImageValidationError'
  }
}

export function detectImageMediaType(
  bytes: Uint8Array,
): ScanImageMediaType | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return 'image/webp'
  }

  return undefined
}

export function validateScanImage(input: {
  bytes: Uint8Array
  declaredMediaType: string
}) {
  if (input.bytes.byteLength === 0) {
    throw new ImageValidationError('Selecciona una imagen con contenido.')
  }
  if (input.bytes.byteLength > MAX_SCAN_IMAGE_BYTES) {
    throw new ImageValidationError(
      'La imagen no se pudo preparar para el análisis.',
    )
  }
  if (
    !SCAN_IMAGE_MEDIA_TYPES.includes(
      input.declaredMediaType as ScanImageMediaType,
    )
  ) {
    throw new ImageValidationError('Usa una imagen PNG, JPEG o WebP.')
  }

  const detectedMediaType = detectImageMediaType(input.bytes)
  if (detectedMediaType === undefined) {
    throw new ImageValidationError('El contenido no es una imagen compatible.')
  }
  if (detectedMediaType !== input.declaredMediaType) {
    throw new ImageValidationError(
      'El tipo declarado no coincide con el contenido de la imagen.',
    )
  }

  return { bytes: input.bytes, mediaType: detectedMediaType }
}
