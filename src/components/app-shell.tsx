import { Link, Outlet, useLocation, useRouter } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

import { PokemonTransitionCoordinator } from '@/components/pokemon-transition-coordinator'
import { RouteReveal } from '@/components/route-reveal'
import { authClient } from '@/lib/auth-client'

const navigation = [
  {
    to: '/app',
    label: 'Resumen',
    icon: 'hn-home',
    group: 'Registro',
    exact: true,
  },
  {
    to: '/app/pokedex',
    label: 'Índice Pokédex',
    icon: 'hn-search',
    group: 'Registro',
  },
  {
    to: '/app/collection',
    label: 'Colección',
    icon: 'hn-book-heart',
    group: 'Registro',
  },
  {
    to: '/app/scan',
    label: 'Identificar carta',
    icon: 'hn-camera',
    group: 'Trabajo de campo',
  },
  {
    to: '/app/insights',
    label: 'Hallazgos',
    icon: 'hn-analytics',
    group: 'Trabajo de campo',
  },
  {
    to: '/app/research',
    label: 'Investigación',
    icon: 'hn-lightbulb',
    group: 'Trabajo de campo',
  },
  {
    to: '/app/assistant',
    label: 'Asistente',
    icon: 'hn-robot',
    group: 'Sistema',
  },
  {
    to: '/app/settings',
    label: 'Ajustes',
    icon: 'hn-cog',
    group: 'Sistema',
  },
] as const

const groups = ['Registro', 'Trabajo de campo', 'Sistema'] as const

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="app-nav" aria-label="Navegación principal">
      {groups.map((group) => (
        <div className="nav-group" key={group}>
          <p>{group}</p>
          {navigation
            .filter((item) => item.group === group)
            .map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: 'exact' in item && item.exact }}
                activeProps={{ 'aria-current': 'page', className: 'active' }}
                onClick={onNavigate}
              >
                <i className={`hn ${item.icon}`} aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            ))}
        </div>
      ))}
    </nav>
  )
}

export function AppShell() {
  const router = useRouter()
  const pathname = useLocation({ select: (location) => location.pathname })
  const { data: session } = authClient.useSession()
  const menu = useRef<HTMLDialogElement>(null)
  const menuTrigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (pathname.length > 0 && menu.current?.open) menu.current.close()
  }, [pathname])

  function closeMenu() {
    menu.current?.close()
  }

  async function signOut() {
    await authClient.signOut()
    await router.navigate({ to: '/' })
  }

  return (
    <PokemonTransitionCoordinator>
      <div className="app-frame">
        <aside className="app-sidebar">
          <Link
            to="/app"
            className="wordmark"
            aria-label="Pokédex Manager, resumen"
          >
            <span className="wordmark-mark" aria-hidden="true">
              PM
            </span>
            <span>Pokédex Manager</span>
          </Link>
          <Navigation />
          <div className="account-block">
            <span>
              <i className="hn hn-user" aria-hidden="true" />
              {session?.user.name ?? 'Cuenta'}
            </span>
            <button type="button" className="text-button" onClick={signOut}>
              <i className="hn hn-logout" aria-hidden="true" />
              Cerrar sesión
            </button>
          </div>
        </aside>
        <div className="app-workspace">
          <header className="mobile-header">
            <Link
              to="/app"
              className="wordmark"
              aria-label="Pokédex Manager, resumen"
            >
              <span className="wordmark-mark" aria-hidden="true">
                PM
              </span>
              <strong>Pokédex Manager</strong>
            </Link>
            <button
              ref={menuTrigger}
              type="button"
              className="icon-button menu-trigger"
              aria-label="Abrir menú principal"
              onClick={() => menu.current?.showModal()}
            >
              <i className="hn hn-bars" aria-hidden="true" />
            </button>
          </header>
          <dialog
            ref={menu}
            className="mobile-menu"
            aria-label="Menú principal"
            onClose={() => menuTrigger.current?.focus()}
          >
            <header>
              <span>
                <i className="hn hn-user" aria-hidden="true" />
                {session?.user.name ?? 'Cuenta'}
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label="Cerrar menú principal"
                onClick={closeMenu}
              >
                <i className="hn hn-times" aria-hidden="true" />
              </button>
            </header>
            <Navigation onNavigate={closeMenu} />
            <button type="button" className="drawer-sign-out" onClick={signOut}>
              <i className="hn hn-logout" aria-hidden="true" />
              Cerrar sesión
            </button>
          </dialog>
          <RouteReveal>
            <Outlet />
          </RouteReveal>
          {pathname !== '/app/assistant' && (
            <Link
              to="/app/assistant"
              className="assistant-fab"
              aria-label="Abrir asistente de colección"
              title="Abrir asistente"
            >
              <i className="hn hn-message-dots" aria-hidden="true" />
              <span>Consultar asistente</span>
            </Link>
          )}
        </div>
      </div>
    </PokemonTransitionCoordinator>
  )
}
