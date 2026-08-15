import { describe, expect, it, vi } from 'vitest'

import {
  ImageOptimizationError,
  optimizeScanImage,
  type ScanImageEncoder,
} from '../../src/lib/image-optimization'
import { MAX_SCAN_IMAGE_BYTES } from '../../src/lib/image-validation'

function largeJpeg() {
  return new File([new Uint8Array(MAX_SCAN_IMAGE_BYTES + 1)], 'card.jpg', {
    type: 'image/jpeg',
    lastModified: 123,
  })
}

describe('scan image optimization', () => {
  it('keeps an image that is already ready to upload', async () => {
    const file = new File([new Uint8Array(128)], 'card.png', {
      type: 'image/png',
    })
    const createEncoder = vi.fn()

    await expect(optimizeScanImage(file, createEncoder)).resolves.toBe(file)
    expect(createEncoder).not.toHaveBeenCalled()
  })

  it('progressively compresses an oversized image before upload', async () => {
    const encode = vi
      .fn<ScanImageEncoder['encode']>()
      .mockResolvedValueOnce(
        new Blob([new Uint8Array(MAX_SCAN_IMAGE_BYTES + 1)], {
          type: 'image/webp',
        }),
      )
      .mockResolvedValueOnce(
        new Blob([new Uint8Array(1_024)], { type: 'image/webp' }),
      )
    const close = vi.fn()

    const result = await optimizeScanImage(largeJpeg(), async () => ({
      encode,
      close,
    }))

    expect(encode).toHaveBeenCalledTimes(2)
    expect(encode.mock.calls[1]?.[0].maxDimension).toBeLessThan(
      encode.mock.calls[0]?.[0].maxDimension ?? 0,
    )
    expect(result).toMatchObject({
      name: 'card.webp',
      size: 1_024,
      type: 'image/webp',
      lastModified: 123,
    })
    expect(close).toHaveBeenCalledOnce()
  })

  it('returns an actionable error when compression cannot prepare the image', async () => {
    const encode = vi.fn<ScanImageEncoder['encode']>().mockResolvedValue(
      new Blob([new Uint8Array(MAX_SCAN_IMAGE_BYTES + 1)], {
        type: 'image/webp',
      }),
    )

    await expect(
      optimizeScanImage(largeJpeg(), async () => ({
        encode,
        close: vi.fn(),
      })),
    ).rejects.toBeInstanceOf(ImageOptimizationError)
    expect(encode).toHaveBeenCalledTimes(8)
  })
})
