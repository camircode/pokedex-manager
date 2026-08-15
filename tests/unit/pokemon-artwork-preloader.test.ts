import { describe, expect, it, vi } from 'vitest'

import { createImagePreloader } from '../../src/lib/pokemon-artwork-preloader'

describe('Pokémon artwork preloader', () => {
  it('assigns the URL and waits for browser decoding', async () => {
    const decode = vi.fn(() => Promise.resolve())
    const image = {
      src: '',
      decode,
      onload: null,
      onerror: null,
    }
    const preload = createImagePreloader(() => image)

    await preload('https://example.test/pikachu.png')

    expect(image.src).toBe('https://example.test/pikachu.png')
    expect(decode).toHaveBeenCalledOnce()
  })

  it('deduplicates in-flight and completed URLs', async () => {
    let finishDecode: (() => void) | undefined
    const decode = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishDecode = resolve
        }),
    )
    const createImage = vi.fn(() => ({
      src: '',
      decode,
      onload: null,
      onerror: null,
    }))
    const preload = createImagePreloader(createImage)

    const first = preload('https://example.test/bulbasaur.png')
    const duplicate = preload('https://example.test/bulbasaur.png')

    expect(duplicate).toBe(first)
    expect(createImage).toHaveBeenCalledOnce()

    finishDecode?.()
    await first

    expect(preload('https://example.test/bulbasaur.png')).toBe(first)
    expect(createImage).toHaveBeenCalledOnce()
  })

  it('evicts failed URLs so a later navigation intent can retry', async () => {
    const createImage = vi
      .fn()
      .mockReturnValueOnce({
        src: '',
        decode: () => Promise.reject(new Error('decode failed')),
        onload: null,
        onerror: null,
      })
      .mockReturnValueOnce({
        src: '',
        decode: () => Promise.resolve(),
        onload: null,
        onerror: null,
      })
    const preload = createImagePreloader(createImage)
    const url = 'https://example.test/charmander.png'

    await expect(preload(url)).rejects.toThrow('decode failed')
    await expect(preload(url)).resolves.toBeUndefined()

    expect(createImage).toHaveBeenCalledTimes(2)
  })
})
