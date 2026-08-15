import { createFileRoute } from '@tanstack/react-router'

import { useApi } from '@/lib/ui'

export const Route = createFileRoute('/app/settings')({ component: Settings })

function Settings() {
  const capabilities = useApi<{ kimi: boolean; mcp: boolean }>(
    '/api/capabilities',
  )
  return (
    <main className="page settings-page">
      <header className="page-header">
        <div>
          <p className="kicker">Integraciones y acceso</p>
          <h1>Ajustes</h1>
          <p>Estado operativo y límites del entorno actual.</p>
        </div>
      </header>
      <section className="settings-row">
        <div>
          <h2>Kimi</h2>
          <p>
            Habilita el reconocimiento visual de cartas. La imagen solo se envía
            con consentimiento explícito y nunca se guarda; el resultado
            requiere confirmación antes de modificar la colección.
          </p>
        </div>
        <span
          className={`status-badge ${capabilities.data?.kimi ? 'active' : 'inactive'}`}
        >
          {capabilities.loading
            ? 'Consultando'
            : capabilities.data?.kimi
              ? 'Configurado'
              : 'No configurado'}
        </span>
      </section>
      <section className="settings-row">
        <div>
          <h2>Asistente contextual</h2>
          <p>
            Consulta catálogo, colección, estadísticas, comparaciones e
            investigación mediante herramientas deterministas con fuentes. No
            requiere Kimi.
          </p>
        </div>
        <span
          className={`status-badge ${capabilities.data?.mcp ? 'active' : 'inactive'}`}
        >
          {capabilities.loading
            ? 'Consultando'
            : capabilities.data?.mcp
              ? 'Configurado'
              : 'No configurado'}
        </span>
      </section>
      <section className="settings-row">
        <div>
          <h2>MCP de solo lectura</h2>
          <p>
            Endpoint Streamable HTTP: <code>/api/mcp</code>. Requiere{' '}
            <code>Authorization: Bearer &lt;token&gt;</code>. Expone catálogo,
            colección, estadísticas y progreso de investigación del sujeto
            configurado para ese bearer; no acepta escrituras.
          </p>
        </div>
        <span className="status-badge active">Disponible</span>
      </section>
      <section className="settings-row">
        <div>
          <h2>Fuente de catálogo</h2>
          <p>
            PokéAPI se consulta bajo demanda con timeout y caché local. Si un
            dato cacheado vence y la fuente falla, se usa el último registro
            disponible.
          </p>
        </div>
        <span className="status-badge active">PokéAPI</span>
      </section>
      <section className="settings-row">
        <div>
          <h2>Código fuente</h2>
          <p>
            Pokédex Manager se distribuye bajo AGPLv3. Consulta el{' '}
            <a href="https://github.com/camircode/pokedex-manager">
              repositorio público y su licencia
            </a>
            .
          </p>
        </div>
        <span className="status-badge active">AGPLv3</span>
      </section>
      <section className="settings-row">
        <div>
          <h2>Iconografía</h2>
          <p>
            Interfaz creada con la{' '}
            <a href="https://pixeliconlibrary.com">
              Pixel Icon Library de HackerNoon
            </a>
            , utilizada sin modificaciones bajo licencia{' '}
            <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
            .
          </p>
        </div>
        <span className="status-badge active">Atribuida</span>
      </section>
    </main>
  )
}
