import { useGSAP } from '@gsap/react'
import { useLocation } from '@tanstack/react-router'
import gsap from 'gsap'
import { useRef } from 'react'

gsap.registerPlugin(useGSAP)

type TransitionAwareDocument = Document & {
  activeViewTransition?: {
    types?: { has: (type: string) => boolean }
  }
}

export function isPokemonDetailViewTransitionActive(documentValue: Document) {
  if (
    documentValue.documentElement.classList.contains(
      'pokemon-detail-transition',
    )
  ) {
    return true
  }
  const hasActiveType = (
    documentValue as TransitionAwareDocument
  ).activeViewTransition?.types?.has('pokemon-detail')
  if (hasActiveType === true) return true

  try {
    return documentValue.documentElement.matches(
      ':active-view-transition-type(pokemon-detail)',
    )
  } catch {
    return false
  }
}

export function RouteReveal({ children }: { children: React.ReactNode }) {
  const container = useRef<HTMLDivElement>(null)
  const href = useLocation({ select: (location) => location.href })

  useGSAP(
    () => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
      if (isPokemonDetailViewTransitionActive(document)) return
      const content = container.current?.firstElementChild
      if (content === undefined || content === null) return
      gsap.fromTo(
        content,
        { autoAlpha: 0.72, y: 10 },
        {
          autoAlpha: 1,
          y: 0,
          duration: 0.42,
          ease: 'expo.out',
          clearProps: 'all',
        },
      )
    },
    { scope: container, dependencies: [href], revertOnUpdate: true },
  )

  return (
    <div className="route-reveal" ref={container}>
      {children}
    </div>
  )
}
