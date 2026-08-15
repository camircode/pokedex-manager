import { createFileRoute, Link } from '@tanstack/react-router'

import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { catalogSearchDefaults, pokemonTypeLabel } from '@/lib/catalog-query'
import { displayName, useApi } from '@/lib/ui'
import type { DashboardStats } from '@/server/collection'

export const Route = createFileRoute('/app/')({ component: Dashboard })

function Dashboard() {
  const state = useApi<DashboardStats>('/api/stats')
  const data = state.data
  return (
    <main className="page">
      <header className="page-header">
        <div>
          <p className="kicker">Estado del registro</p>
          <h1>Resumen de colección</h1>
        </div>
        <Link
          to="/app/pokedex"
          search={catalogSearchDefaults}
          className="button primary"
        >
          <i className="hn hn-search" aria-hidden="true" />
          Buscar Pokémon
        </Link>
      </header>
      {state.loading && <LoadingState />}
      {state.error && <ErrorState message={state.error} />}
      {data && data.totalUnique === 0 && (
        <EmptyState title="Tu registro está vacío">
          Busca una especie en el índice Pokédex y agrega tu primer ejemplar.
        </EmptyState>
      )}
      {data && data.totalUnique > 0 && (
        <>
          <dl className="stat-ledger">
            <div>
              <dt>Especies</dt>
              <dd>{data.totalUnique}</dd>
            </div>
            <div>
              <dt>Ejemplares</dt>
              <dd>{data.totalQuantity}</dd>
            </div>
            <div>
              <dt>Favoritos</dt>
              <dd>{data.favorites}</dd>
            </div>
          </dl>
          <div className="dashboard-columns">
            <section>
              <h2>Presencia por tipo</h2>
              <p className="section-note">
                Porcentaje de ejemplares que incluye cada tipo.
              </p>
              <div className="bar-list">
                {data.typeDistribution.map((item) => {
                  const percentage = Math.round(
                    (item.count / data.totalQuantity) * 100,
                  )
                  const typeName = pokemonTypeLabel(item.type)
                  return (
                    <div className="type-presence" key={item.type}>
                      <div className="type-presence-caption">
                        <span>{typeName}</span>
                        <strong className="type-presence-value">
                          {item.count} de {data.totalQuantity}
                          <small>{percentage}%</small>
                        </strong>
                      </div>
                      <meter
                        className="type-presence-track"
                        min={0}
                        max={data.totalQuantity}
                        value={item.count}
                        aria-label={typeName}
                        aria-valuetext={`${item.count} de ${data.totalQuantity} ejemplares, ${percentage}%`}
                      />
                    </div>
                  )
                })}
              </div>
            </section>
            <section>
              <h2>Actividad reciente</h2>
              <ol className="recent-list">
                {data.recent.map((entry) => (
                  <li key={entry.pokemonId}>
                    <span className="index-number">
                      #{String(entry.pokemonId).padStart(4, '0')}
                    </span>
                    <strong>{displayName(entry.pokemon.name)}</strong>
                    <span>{entry.quantity} u.</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </>
      )}
    </main>
  )
}
