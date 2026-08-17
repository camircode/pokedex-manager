import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  buildCatalogApiUrl,
  catalogQuerySchema,
  catalogSearchDefaults,
  pokemonDetailSearchSchema,
} from '../../src/lib/catalog-query'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const read = (path: string) => readFileSync(resolve(root, path), 'utf8')
const readStyles = () =>
  [
    'src/styles/tokens.css',
    'src/styles/public.css',
    'src/styles/shell.css',
    'src/styles/catalog.css',
    'src/styles/collection.css',
    'src/styles/ai-reports.css',
    'src/styles/scan.css',
    'src/styles/assistant.css',
    'src/styles/responsive.css',
  ]
    .map(read)
    .join('\n')

describe('Pokedex URL and responsive UI contracts', () => {
  it('exposes password visibility in both authentication flows', () => {
    const passwordField = read('src/components/password-field.tsx')
    const signIn = read('src/routes/sign-in.tsx')
    const signUp = read('src/routes/sign-up.tsx')

    expect(signIn).toContain('<PasswordField autoComplete="current-password"')
    expect(signUp).toContain('autoComplete="new-password"')
    expect(passwordField).toContain("visible ? 'text' : 'password'")
    expect(passwordField).toContain('aria-pressed={visible}')
    expect(passwordField).toContain("visible ? 'Ocultar' : 'Mostrar'")
  })

  it('describes overlapping type presence with an explicit denominator', () => {
    const dashboard = read('src/routes/app/index.tsx')
    const styles = readStyles()

    expect(dashboard).toContain('Presencia por tipo')
    expect(dashboard).toContain('Porcentaje de ejemplares')
    expect(dashboard).toContain('<meter')
    expect(dashboard).toContain('aria-valuetext=')
    expect(dashboard).toContain('{item.count} de {data.totalQuantity}')
    expect(styles).not.toContain('.bar-list > div')
    expect(styles).toMatch(
      /\.type-presence-caption\s*{[^}]*display: flex;[^}]*justify-content: space-between/,
    )
  })

  it('keeps the landing promise specific and its primary actions aligned', () => {
    const landing = read('src/routes/index.tsx')
    const styles = readStyles()
    const landingHeader = landing.match(/<header[\s\S]*?<\/header>/)?.[0]

    expect(landing).toContain('¿Crees que es una Pokédex normal?')
    expect(landing).toContain('Un LLM conectado por MCP')
    expect(landing).toContain('expediciones verificables')
    expect(landing).not.toContain('LLM + MCP / Colección')
    expect(landing).not.toContain('REGISTRO / OPERACIÓN')
    expect(landingHeader).not.toContain('to="/sign-in"')
    expect(landing).toContain('className="button-row landing-actions"')
    expect(styles).toMatch(
      /\.landing-actions\s*{[^}]*grid-template-columns: repeat\(2, minmax\(0, 13\.5rem\)\)/,
    )
    expect(styles).toMatch(
      /\.landing-actions \.button\s*{[^}]*width: 100%;[^}]*min-height: 4rem/,
    )
  })

  it('returns authenticated visitors from the public entry to the app', () => {
    const landing = read('src/routes/index.tsx')

    expect(landing).toContain("import { getSession } from '@/server/session'")
    expect(landing).toContain('beforeLoad: async () => {')
    expect(landing).toContain('const session = await getSession()')
    expect(landing).toContain(
      "if (session !== null) throw redirect({ to: '/app' })",
    )
  })

  it('keeps typed catalog defaults deterministic and shareable', () => {
    const pokedex = read('src/routes/app/pokedex/index.tsx')
    expect(catalogQuerySchema.parse({})).toEqual(catalogSearchDefaults)
    expect(buildCatalogApiUrl(catalogSearchDefaults)).toBe(
      '/api/catalog?query=&type=&generation=&ability=&category=&sort=id-asc&page=1&limit=20',
    )
    expect(pokedex).toMatch(/validateSearch/)
    expect(pokedex).toContain(
      '<details ref={filtersRef} className="catalog-filters">',
    )
    expect(pokedex).not.toContain('className="catalog-filters" open')
    expect(pokedex).toContain('className="pokemon-metadata"')
    expect(pokedex).toContain('className="row-link-label"')
    const styles = readStyles()
    expect(styles).toMatch(
      /\.pokemon-table \.table-row\s*{[^}]*grid-template-areas:[^}]*"artwork number action"/,
    )
    expect(styles).toMatch(
      /\.pokemon-table \.row-link\s*{[^}]*width: 44px;[^}]*height: 44px/,
    )
    expect(
      pokemonDetailSearchSchema.parse({
        ...catalogSearchDefaults,
        from: 'catalog',
      }),
    ).toEqual({ ...catalogSearchDefaults, from: 'catalog' })
  })

  it('uses a complete mobile drawer and route-aware assistant action', () => {
    const shell = read('src/components/app-shell.tsx')
    const styles = readStyles()
    expect(shell).toContain('<dialog')
    expect(shell).toContain('aria-label="Abrir menú principal"')
    expect(shell).toContain("pathname !== '/app/assistant'")
    expect(shell).toContain('className="assistant-fab"')
    expect(styles).toMatch(/safe-area-inset-(?:top|bottom)/)
    expect(styles).toContain('@media (max-width: 800px)')
    expect(styles).toContain('@media (max-width: 480px)')
  })

  it('bundles one icon family with attribution and licensed font honesty', () => {
    const rootRoute = read('src/routes/__root.tsx')
    const readme = read('README.md')
    const design = read('DESIGN.md')
    expect(rootRoute).toContain(
      '@hackernoon/pixel-icon-library/fonts/iconfont.css',
    )
    for (const weight of [400, 600, 700, 800]) {
      expect(rootRoute).toContain(`@fontsource/open-sans/latin-${weight}.css`)
    }
    expect(readme).toMatch(/CC BY 4\.0/)
    expect(design).toContain('Modified ITC Kabel Ultra')
    expect(design).toContain('Eurostile Extended Bold')
    expect(design).toMatch(/solo se activan.*archivos licenciados/i)
  })

  it('guards scoped motion with reduced-motion and native view transitions', () => {
    const router = read('src/router.tsx')
    const reveal = read('src/components/route-reveal.tsx')
    expect(router).toContain('defaultViewTransition')
    expect(router).toContain('isPokemonDetailNavigation(')
    expect(router).toContain("return ['pokemon-detail']")
    expect(router).toContain(
      "return pathChanged ? ['route-navigation'] : false",
    )
    expect(reveal).toContain('gsap.registerPlugin(useGSAP)')
    expect(reveal).toContain('prefers-reduced-motion: reduce')
    expect(reveal).toContain('scope: container')
    expect(reveal).toContain('revertOnUpdate: true')
  })

  it('streams assistant activity and renders safe Markdown with named sources', () => {
    const assistant = read('src/routes/app/assistant.tsx')
    const assistantApi = read('src/routes/api/assistant.ts')
    const assistantServer = read('src/server/assistant.ts')
    const eventStreamResponse = read('src/server/event-stream-response.ts')
    const styles = readStyles()
    const packageJson = read('package.json')

    expect(packageJson).toContain('"react-markdown"')
    expect(packageJson).toContain('"remark-gfm"')
    expect(assistant).toContain("Accept: 'text/event-stream'")
    expect(assistant).toContain('<Markdown')
    expect(assistant).toContain('skipHtml')
    expect(assistant).toContain('Fuente ')
    expect(assistant).toContain('Razonamiento y herramientas')
    expect(assistant).toContain('useLayoutEffect(() => {')
    expect(assistant).toContain("behavior: 'instant'")
    expect(assistant).toContain('threadEndRef.current?.scrollIntoView')
    expect(assistant).toContain('completedPersisted')
    expect(assistant).toContain('className="conversation-picker"')
    expect(styles).not.toContain(
      'overflow-x: auto;\n  }\n  .conversation-index li',
    )
    expect(assistantApi).toContain('createEventStreamResponse')
    expect(eventStreamResponse).toContain(
      "'Content-Type': 'text/event-stream; charset=utf-8'",
    )
    expect(eventStreamResponse).toContain(': keep-alive')
    expect(assistantServer).toContain("type: 'tool_call'")
    expect(styles).toContain('@keyframes prompt-steps-spin')
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.spinning[\s\S]*animation: none/,
    )
  })

  it('progressively discloses dense controls on mobile', () => {
    const collection = read('src/routes/app/collection.tsx')
    const ui = read('src/lib/ui.ts')
    const styles = readStyles()

    expect(ui).toContain("useResponsiveDetails(query = '(min-width: 721px)')")
    expect(collection).toContain('className="collection-editor"')
    expect(collection).not.toContain('ref={editorRef}')
    expect(collection).toContain('className="collection-tags"')
    expect(collection).toContain('Cerrar edición')
    expect(styles).toMatch(
      /\.collection-editor > summary\s*{[^}]*display: flex/,
    )
    expect(styles).toMatch(
      /@media \(max-width: 720px\)[\s\S]*\.conversation-picker[\s\S]*display: block/,
    )
    expect(styles).toMatch(
      /\.message-markdown table\s*{[^}]*table-layout: fixed/,
    )
  })

  it('renders provider reasoning with Prompt Kit Steps on every AI surface', () => {
    const insights = read('src/routes/app/insights.tsx')
    const research = read('src/routes/app/research.tsx')
    const scan = read('src/routes/app/scan.tsx')
    const assistant = read('src/routes/app/assistant.tsx')
    const reasoning = read('src/components/ai-reasoning.tsx')
    const promptKitSteps = read('src/components/prompt-kit/steps.tsx')
    const styles = readStyles()

    for (const surface of [insights, research, scan, assistant]) {
      expect(surface).toContain('<AiReasoning')
    }
    for (const surface of [insights, research, scan]) {
      expect(surface).toContain("Accept: 'text/event-stream'")
      expect(surface).toContain('consumeEventStream')
      expect(surface).toContain("event.type === 'reasoning'")
    }
    expect(reasoning).toContain("from '@/components/prompt-kit/steps'")
    expect(reasoning).toContain('Razonamiento de Kimi')
    expect(reasoning).not.toContain('AiReasoningStep')
    expect(reasoning).toContain('function ReasoningStep')
    expect(reasoning).toContain('hn hn-sparkles')
    expect(reasoning).toContain('setOpen(active)')
    expect(promptKitSteps).toContain('export function Steps')
    expect(promptKitSteps).toContain('export const StepsItem')
    expect(promptKitSteps).toContain('export const StepsContent')
    expect(promptKitSteps).toContain('prompt-steps-item-trigger')
    expect(promptKitSteps).toContain('prompt-steps-item-content')
    expect(promptKitSteps).toContain('prompt-steps-chevron')
    expect(research).not.toContain('Narrativa generada')
    expect(research).not.toContain(
      'Generada con Kimi · {expedition.generation.model}',
    )
    expect(styles).toContain('@keyframes prompt-steps-spin')
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.spinning[\s\S]*animation: none/,
    )
  })

  it('offers camera capture without removing file selection', () => {
    const scan = read('src/routes/app/scan.tsx')

    expect(scan).toContain('capture="environment"')
    expect(scan).toContain('Tomar foto')
    expect(scan).toContain('Elegir archivo')
  })

  it('preloads both routes and scopes shared Pokemon fields through animation', () => {
    const list = read('src/routes/app/pokedex/index.tsx')
    const detail = read('src/routes/app/pokedex/$pokemonId.tsx')
    const detailServerFunction = read('src/lib/pokemon-detail.functions.ts')
    const catalogServerFunction = read('src/lib/pokemon-catalog.functions.ts')
    const shell = read('src/components/app-shell.tsx')
    const coordinator = read(
      'src/components/pokemon-transition-coordinator.tsx',
    )
    const reveal = read('src/components/route-reveal.tsx')
    const styles = readStyles()

    expect(detailServerFunction).toContain("createServerFn({ method: 'GET' })")
    expect(detailServerFunction).toContain('getCatalogService()')
    expect(catalogServerFunction).toContain("createServerFn({ method: 'GET' })")
    expect(catalogServerFunction).toContain('service.list(data)')
    expect(catalogServerFunction).toContain('service.listFilterOptions()')
    expect(list).toContain('loaderDeps: ({ search }) => search')
    expect(list).toContain('Route.useLoaderData()')
    expect(list).not.toContain('useApi<')
    expect(detail).toContain('loader: ({ params }) =>')
    expect(detail).toContain('Route.useLoaderData()')
    expect(detail).toContain('pokemonDetailErrorMessage(error)')
    expect(detail).not.toContain('useApi<')
    expect(list).toContain("viewTransition={{ types: ['pokemon-detail'] }}")
    expect(list).toContain('resetScroll={false}')
    expect(detail).toContain('Volver a la búsqueda')
    expect(detail).toContain("from === 'catalog'")
    expect(detail).toContain('useLayoutEffect(() => {')
    expect(detail).toContain(
      "window.scrollTo({ top: 0, left: 0, behavior: 'instant' })",
    )
    expect(shell).toContain('<PokemonTransitionCoordinator>')
    expect(coordinator).toContain("router.subscribe('onBeforeNavigate'")
    expect(coordinator).toContain("router.subscribe('onRendered'")
    expect(coordinator).toContain('activeViewTransition')
    expect(coordinator).toContain('transition.finished.then(')
    for (const part of ['artwork', 'name', 'number', 'types']) {
      expect(list).toContain(
        `pokemonTransitionStyle(transitionActive, '${part}')`,
      )
      expect(detail).toContain(
        `pokemonTransitionStyle(transitionActive, '${part}')`,
      )
    }
    expect(list).toContain(
      'className="pokemon-artwork-frame catalog-artwork-frame"',
    )
    expect(detail).toContain(
      'className="pokemon-artwork-frame detail-artwork-frame"',
    )
    expect(styles).toContain('contain: layout paint')
    expect(styles).toMatch(/\.catalog-artwork-frame\s*{[^}]*height: 64px/)
    expect(styles).toMatch(/\.detail-artwork-frame\s*{[^}]*height: 260px/)

    expect(reveal).toContain('isPokemonDetailViewTransitionActive(document)')
    expect(reveal).toContain("'pokemon-detail-transition'")
    expect(reveal).toContain(':active-view-transition-type(pokemon-detail)')
    expect(styles).toContain(':active-view-transition-type(pokemon-detail)')
    expect(styles).toContain('::view-transition-group(pokemon-artwork)')
    expect(styles).toContain('::view-transition-old(pokemon-artwork)')
    expect(styles).not.toContain('isolation: auto')
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*::view-transition-group\(\*\)[\s\S]*::view-transition-group\(pokemon-artwork\)[\s\S]*animation: none/,
    )
  })
})
