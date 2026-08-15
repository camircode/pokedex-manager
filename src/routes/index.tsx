import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  return (
    <main className="landing">
      <header className="landing-nav">
        <span className="wordmark">
          <span className="wordmark-mark" aria-hidden="true">
            PM
          </span>{' '}
          Pokédex Manager
        </span>
      </header>
      <section className="landing-intro">
        <div>
          <h1>¿Crees que es una Pokédex normal?</h1>
          <p className="lead">
            No. Un LLM conectado por MCP analiza tu colección, reconoce cartas y
            transforma vacíos reales en hallazgos y expediciones verificables.
          </p>
          <div className="button-row landing-actions">
            <Link to="/sign-up" className="button primary">
              <i className="hn hn-user-plus" aria-hidden="true" />
              Crear cuenta
            </Link>
            <Link to="/sign-in" className="button secondary">
              <i className="hn hn-user" aria-hidden="true" />
              Ya tengo una cuenta
            </Link>
          </div>
        </div>
        <section
          className="field-sheet"
          aria-label="Flujo de trabajo del producto"
        >
          <ol>
            <li>
              <strong>01</strong>
              <span>Registra tu colección con datos de PokéAPI.</span>
            </li>
            <li>
              <strong>02</strong>
              <span>Consulta un asistente conectado por MCP.</span>
            </li>
            <li>
              <strong>03</strong>
              <span>Genera hallazgos y expediciones con IA verificable.</span>
            </li>
          </ol>
        </section>
      </section>
      <footer className="landing-footer">
        <span>
          Datos de catálogo: PokéAPI. La colección permanece aislada por cuenta.
        </span>{' '}
        <a href="https://github.com/camircode/pokedex-manager">
          Código fuente · AGPLv3
        </a>
      </footer>
    </main>
  )
}
