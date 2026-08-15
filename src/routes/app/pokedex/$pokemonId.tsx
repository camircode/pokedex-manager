import { createFileRoute, Link } from '@tanstack/react-router'
import { useLayoutEffect, useState } from 'react'

import { useActivePokemonTransition } from '@/components/pokemon-transition-coordinator'
import { ErrorState, LoadingState } from '@/components/status'
import {
  catalogQuerySchema,
  catalogSearchDefaults,
  pokemonStatLabel,
  pokemonTypeLabel,
  pokemonDetailSearchSchema,
} from '@/lib/catalog-query'
import { loadPokemonDetail } from '@/lib/pokemon-detail.functions'
import { pokemonTransitionStyle } from '@/lib/pokemon-view-transition'
import { apiMutation, displayName } from '@/lib/ui'

export const Route = createFileRoute('/app/pokedex/$pokemonId')({
  validateSearch: (search) => pokemonDetailSearchSchema.parse(search),
  loader: ({ params }) =>
    loadPokemonDetail({ data: { pokemonId: params.pokemonId } }),
  pendingComponent: () => (
    <main className="page detail-page">
      <BackToPokedex />
      <LoadingState label="Cargando ficha Pokémon…" />
    </main>
  ),
  errorComponent: ({ error }) => (
    <main className="page detail-page">
      <BackToPokedex />
      <ErrorState message={pokemonDetailErrorMessage(error)} />
    </main>
  ),
  component: PokemonDetail,
})

function generationLabel(generation: string) {
  return `Generación ${generation.replace('generation-', '').toUpperCase()}`
}

function pokemonDetailErrorMessage(error: unknown) {
  if (
    error instanceof Error &&
    [
      'Identificador de Pokémon inválido.',
      'Pokémon no encontrado.',
      'No se pudo cargar la ficha del Pokémon.',
    ].includes(error.message)
  ) {
    return error.message
  }
  return 'No se pudo cargar la ficha del Pokémon.'
}

function PokemonDetail() {
  const pokemon = Route.useLoaderData()
  const search = Route.useSearch()
  const transitionActive = useActivePokemonTransition(pokemon.pokemonId)
  const name = pokemon.displayName ?? displayName(pokemon.name)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useLayoutEffect(() => {
    if (search.from !== 'catalog') return
    // Align the destination before View Transitions captures its named element.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [search.from])

  async function add() {
    setMessage('')
    setError('')
    try {
      await apiMutation('/api/collection', {
        method: 'POST',
        body: JSON.stringify({ pokemonId: pokemon.pokemonId, quantity: 1 }),
      })
      setMessage('Ejemplar agregado. Si ya existía, se incrementó la cantidad.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo agregar.')
    }
  }
  return (
    <main className="page detail-page">
      <BackToPokedex pokemonId={pokemon.pokemonId} />
      <header className="detail-header">
        <div>
          <p
            className="index-number"
            style={pokemonTransitionStyle(transitionActive, 'number')}
          >
            #{String(pokemon.pokemonId).padStart(4, '0')}
          </p>
          <h1 style={pokemonTransitionStyle(transitionActive, 'name')}>
            {name}
          </h1>
          <p className="detail-taxonomy">
            <span>{pokemon.genus ?? 'Especie Pokémon'}</span>
            <span aria-hidden="true"> · </span>
            <span>{generationLabel(pokemon.generation)}</span>
          </p>
          <div
            className="type-list"
            style={pokemonTransitionStyle(transitionActive, 'types')}
          >
            {pokemon.types.map((type) => (
              <span className={`type type-${type}`} key={type}>
                {pokemonTypeLabel(type)}
              </span>
            ))}
          </div>
          {pokemon.description && (
            <p className="detail-description">{pokemon.description}</p>
          )}
        </div>
        {pokemon.sprite && (
          <div
            className="pokemon-artwork-frame detail-artwork-frame"
            style={pokemonTransitionStyle(transitionActive, 'artwork')}
          >
            <img
              src={pokemon.sprite}
              alt={`Ilustración oficial de ${name}`}
              width="260"
              height="260"
            />
          </div>
        )}
      </header>
      <div className="button-row">
        <button type="button" className="button primary" onClick={add}>
          <i className="hn hn-plus" aria-hidden="true" />
          Agregar a colección
        </button>
      </div>
      {message && (
        <p className="status-line success" role="status">
          {message}
        </p>
      )}
      {error && <ErrorState message={error} />}
      <div className="detail-columns">
        <section>
          <h2>Estadísticas base</h2>
          <dl className="detail-list">
            {pokemon.stats.map((stat) => (
              <div key={stat.name}>
                <dt>{pokemonStatLabel(stat.name)}</dt>
                <dd>{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section>
          <h2>Habilidades</h2>
          <ul className="ability-list">
            {pokemon.abilities.map((ability) => (
              <li key={ability.name}>
                <div>
                  <strong>{ability.displayName}</strong>
                  {ability.hidden && <small>Habilidad oculta</small>}
                </div>
                <p>
                  {ability.description ??
                    'PokéAPI no ofrece una descripción en español para esta habilidad.'}
                </p>
              </li>
            ))}
          </ul>
          <dl className="measure-list">
            <div>
              <dt>Altura</dt>
              <dd>{pokemon.height / 10} m</dd>
            </div>
            <div>
              <dt>Peso</dt>
              <dd>{pokemon.weight / 10} kg</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  )
}

function BackToPokedex({ pokemonId }: { pokemonId?: number }) {
  const search = Route.useSearch()
  const params = Route.useParams()
  const { from, ...catalogSearch } = search
  const returnSearch =
    from === 'catalog'
      ? catalogQuerySchema.parse(catalogSearch)
      : {
          ...catalogSearchDefaults,
          query: String(pokemonId ?? params.pokemonId),
        }

  return (
    <Link
      to="/app/pokedex"
      search={returnSearch}
      className="detail-back-link"
      viewTransition={{ types: ['pokemon-detail'] }}
    >
      <i className="hn hn-arrow-left" aria-hidden="true" />
      Volver a la búsqueda
    </Link>
  )
}
