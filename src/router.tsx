import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { isPokemonDetailNavigation } from '@/lib/pokemon-view-transition'
import { routeTree } from '@/routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
    defaultViewTransition: {
      types: ({ fromLocation, toLocation, pathChanged }) => {
        if (
          isPokemonDetailNavigation(fromLocation?.pathname, toLocation.pathname)
        ) {
          return ['pokemon-detail']
        }
        return pathChanged ? ['route-navigation'] : false
      },
    },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
