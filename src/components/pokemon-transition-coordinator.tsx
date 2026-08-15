import { useRouter } from '@tanstack/react-router'
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { flushSync } from 'react-dom'

import { pokemonDetailTransitionId } from '@/lib/pokemon-view-transition'

type TransitionDocument = Document & {
  activeViewTransition?: { finished: Promise<unknown> }
}

const PokemonTransitionContext = createContext<number | undefined>(undefined)

export function PokemonTransitionCoordinator({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
  const generation = useRef(0)
  const [activePokemonId, setActivePokemonId] = useState<number>()

  useEffect(() => {
    const root = document.documentElement
    const unsubscribeBefore = router.subscribe('onBeforeNavigate', (event) => {
      generation.current += 1
      const pokemonId = pokemonDetailTransitionId(
        event.fromLocation?.pathname,
        event.toLocation.pathname,
      )
      root.classList.toggle(
        'pokemon-detail-transition',
        pokemonId !== undefined,
      )
      flushSync(() => setActivePokemonId(pokemonId))
    })
    const unsubscribeRendered = router.subscribe('onRendered', () => {
      const currentGeneration = generation.current
      const clearCapturedName = () => {
        if (generation.current !== currentGeneration) return
        root.classList.remove('pokemon-detail-transition')
        flushSync(() => setActivePokemonId(undefined))
      }
      const transition = (document as TransitionDocument).activeViewTransition
      if (transition === undefined) {
        clearCapturedName()
        return
      }
      void transition.finished.then(clearCapturedName, clearCapturedName)
    })

    return () => {
      unsubscribeBefore()
      unsubscribeRendered()
      root.classList.remove('pokemon-detail-transition')
    }
  }, [router])

  return (
    <PokemonTransitionContext.Provider value={activePokemonId}>
      {children}
    </PokemonTransitionContext.Provider>
  )
}

export function useActivePokemonTransition(pokemonId: number) {
  return useContext(PokemonTransitionContext) === pokemonId
}
