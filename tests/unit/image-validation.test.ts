import { describe, expect, it } from 'vitest'

import {
  detectImageMediaType,
  MAX_SCAN_IMAGE_BYTES,
  validateScanImage,
} from '../../src/lib/image-validation'

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
const webp = new TextEncoder().encode('RIFF0000WEBP')

describe('scan image validation', () => {
  it('detects only the supported image signatures', () => {
    expect(detectImageMediaType(png)).toBe('image/png')
    expect(detectImageMediaType(jpeg)).toBe('image/jpeg')
    expect(detectImageMediaType(webp)).toBe('image/webp')
    expect(detectImageMediaType(new TextEncoder().encode('<svg></svg>'))).toBe(
      undefined,
    )
  })

  it('rejects MIME mismatches, SVG, arbitrary bytes and oversized uploads', () => {
    expect(() =>
      validateScanImage({ bytes: png, declaredMediaType: 'image/jpeg' }),
    ).toThrow(/no coincide/i)
    expect(() =>
      validateScanImage({
        bytes: new TextEncoder().encode('<svg></svg>'),
        declaredMediaType: 'image/svg+xml',
      }),
    ).toThrow(/PNG, JPEG o WebP/i)
    expect(() =>
      validateScanImage({
        bytes: new Uint8Array([1, 2, 3]),
        declaredMediaType: 'image/png',
      }),
    ).toThrow(/contenido/i)
    expect(() =>
      validateScanImage({
        bytes: new Uint8Array(MAX_SCAN_IMAGE_BYTES + 1),
        declaredMediaType: 'image/png',
      }),
    ).toThrow(/preparar para el análisis/i)
  })
})
