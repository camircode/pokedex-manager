type PreloadableImage = {
  src: string
  decode?: () => Promise<void>
  onload: (() => void) | null
  onerror: (() => void) | null
}

export function createImagePreloader(
  createImage: () => PreloadableImage = () => new Image() as PreloadableImage,
) {
  const preloads = new Map<string, Promise<void>>()

  return (url: string): Promise<void> => {
    if (!url) return Promise.resolve()

    const existing = preloads.get(url)
    if (existing) return existing

    const preload = new Promise<void>((resolve, reject) => {
      const image = createImage()

      if (typeof image.decode === 'function') {
        image.src = url
        void image.decode().then(resolve, reject)
        return
      }

      image.onload = () => resolve()
      image.onerror = () =>
        reject(new Error(`Unable to preload Pokémon artwork: ${url}`))
      image.src = url
    })

    let tracked: Promise<void>
    tracked = preload.catch((error: unknown) => {
      if (preloads.get(url) === tracked) preloads.delete(url)
      throw error
    })
    preloads.set(url, tracked)
    return tracked
  }
}

export const preloadPokemonArtwork = createImagePreloader()
