import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'

import { useActivePokemonTransition } from '@/components/pokemon-transition-coordinator'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import {
  CATALOG_SORTS,
  catalogQuerySchema,
  catalogSearchDefaults,
  POKEMON_GENERATIONS,
  POKEMON_TYPES,
} from '@/lib/catalog-query'
import { loadPokemonCatalog } from '@/lib/pokemon-catalog.functions'
import { pokemonTransitionStyle } from '@/lib/pokemon-view-transition'
import { displayName, useResponsiveDetails } from '@/lib/ui'

const sortLabels = {
  'id-asc': 'Número: menor a mayor',
  'id-desc': 'Número: mayor a menor',
  'name-asc': 'Nombre: A a Z',
  'name-desc': 'Nombre: Z a A',
} as const

export const Route = createFileRoute('/app/pokedex/')({
  validateSearch: (search) => catalogQuerySchema.parse(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadPokemonCatalog({ data: deps }),
  pendingComponent: () => (
    <main className="page wide-page pokedex-page">
      <LoadingState label="Consultando el índice…" />
    </main>
  ),
  errorComponent: () => (
    <main className="page wide-page pokedex-page">
      <ErrorState message="No se pudo consultar el índice Pokémon." />
    </main>
  ),
  component: Pokedex,
})

function generationLabel(generation: string) {
  return `Generación ${generation.replace('generation-', '').toUpperCase()}`
}

function Pokedex() {
  const search = Route.useSearch()
  const navigate = useNavigate({ from: Route.fullPath })
  const catalog = Route.useLoaderData()
  const filtersRef = useResponsiveDetails()
  const activeFilters = [
    search.query ? `Búsqueda: “${search.query}”` : '',
    search.type ? `Tipo: ${displayName(search.type)}` : '',
    search.generation ? generationLabel(search.generation) : '',
    search.sort !== 'id-asc' ? sortLabels[search.sort] : '',
  ].filter(Boolean)

  return (
    <main className="page wide-page pokedex-page">
      <header className="page-header catalog-header">
        <div>
          <p className="kicker">Catálogo operativo</p>
          <h1>Índice Pokédex</h1>
          <p>
            Filtra el índice completo de PokéAPI y abre solo las fichas que
            necesitas.
          </p>
        </div>
        <span className="catalog-stamp" aria-hidden="true">
          PKM / 001—1025
        </span>
      </header>

      <details ref={filtersRef} className="catalog-filters">
        <summary>
          <span>
            <i className="hn hn-filter" aria-hidden="true" />
            Filtros y orden
          </span>
          <i className="hn hn-chevron-down" aria-hidden="true" />
        </summary>
        <form
          key={JSON.stringify(search)}
          className="filter-grid"
          onSubmit={(event) => {
            event.preventDefault()
            const data = new FormData(event.currentTarget)
            void navigate({
              search: catalogQuerySchema.parse({
                query: data.get('query'),
                type: data.get('type'),
                generation: data.get('generation'),
                sort: data.get('sort'),
                limit: data.get('limit'),
                page: 1,
              }),
            })
          }}
        >
          <label className="filter-search">
            Nombre o número
            <span className="input-with-icon">
              <i className="hn hn-search" aria-hidden="true" />
              <input
                name="query"
                defaultValue={search.query}
                placeholder="Ej.: pikachu o 25"
                maxLength={40}
              />
            </span>
          </label>
          <label>
            Tipo
            <select name="type" defaultValue={search.type}>
              <option value="">Todos los tipos</option>
              {POKEMON_TYPES.map((type) => (
                <option value={type} key={type}>
                  {displayName(type)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Generación
            <select name="generation" defaultValue={search.generation}>
              <option value="">Todas</option>
              {POKEMON_GENERATIONS.map((generation) => (
                <option value={generation} key={generation}>
                  {generationLabel(generation)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Orden
            <select name="sort" defaultValue={search.sort}>
              {CATALOG_SORTS.map((sort) => (
                <option value={sort} key={sort}>
                  {sortLabels[sort]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Resultados por página
            <select name="limit" defaultValue={String(search.limit)}>
              {[5, 10, 20, 25].map((limit) => (
                <option value={limit} key={limit}>
                  {limit}
                </option>
              ))}
            </select>
          </label>
          <div className="filter-actions">
            <button type="submit" className="button primary">
              <i className="hn hn-filter-solid" aria-hidden="true" />
              Aplicar filtros
            </button>
            <button
              type="button"
              className="button secondary"
              onClick={() => void navigate({ search: catalogSearchDefaults })}
            >
              <i className="hn hn-times" aria-hidden="true" />
              Limpiar
            </button>
          </div>
        </form>
      </details>

      <div className="active-filter-summary" aria-live="polite">
        <i className="hn hn-sort" aria-hidden="true" />
        <span>
          {activeFilters.length > 0
            ? activeFilters.join(' · ')
            : 'Índice completo · número ascendente'}
        </span>
      </div>

      {catalog.items.length === 0 && (
        <EmptyState title="No hay coincidencias">
          Prueba otra búsqueda o elimina uno de los filtros activos.
        </EmptyState>
      )}
      {catalog.items.length > 0 && (
        <div className="catalog-results">
          <div className="table-summary">
            <span>{catalog.total} resultados</span>
            <span>
              Página {catalog.page} de {catalog.pages}
            </span>
          </div>
          <section
            className="data-table pokemon-table"
            aria-label="Catálogo Pokémon"
          >
            <div className="table-head">
              <span>N.º</span>
              <span>Especie</span>
              <span>Tipos</span>
              <span>Generación</span>
              <span>
                <span className="sr-only">Acción</span>
              </span>
            </div>
            {catalog.items.map((pokemon) => (
              <PokemonRow
                pokemon={pokemon}
                search={search}
                key={pokemon.pokemonId}
              />
            ))}
          </section>
          <nav className="pagination" aria-label="Paginación">
            <button
              type="button"
              className="button secondary"
              disabled={search.page <= 1}
              onClick={() =>
                void navigate({
                  search: (old) => ({ ...old, page: old.page - 1 }),
                })
              }
            >
              <i className="hn hn-arrow-left" aria-hidden="true" />
              Anterior
            </button>
            <span aria-current="page">
              {catalog.page} / {catalog.pages}
            </span>
            <button
              type="button"
              className="button secondary"
              disabled={search.page >= catalog.pages}
              onClick={() =>
                void navigate({
                  search: (old) => ({ ...old, page: old.page + 1 }),
                })
              }
            >
              Siguiente
              <i className="hn hn-arrow-right" aria-hidden="true" />
            </button>
          </nav>
        </div>
      )}
    </main>
  )
}

type PokemonRowProps = {
  pokemon: Awaited<ReturnType<typeof loadPokemonCatalog>>['items'][number]
  search: ReturnType<typeof Route.useSearch>
}

function PokemonRow({ pokemon, search }: PokemonRowProps) {
  const transitionActive = useActivePokemonTransition(pokemon.pokemonId)

  return (
    <div className="table-row">
      <span
        data-label="Número"
        className="index-number"
        style={pokemonTransitionStyle(transitionActive, 'number')}
      >
        #{String(pokemon.pokemonId).padStart(4, '0')}
      </span>
      <span data-label="Especie" className="species-cell">
        {pokemon.sprite && (
          <span
            className="pokemon-artwork-frame catalog-artwork-frame"
            style={pokemonTransitionStyle(transitionActive, 'artwork')}
          >
            <img
              src={pokemon.sprite}
              alt=""
              width="64"
              height="64"
              loading="lazy"
            />
          </span>
        )}
        <strong style={pokemonTransitionStyle(transitionActive, 'name')}>
          {displayName(pokemon.name)}
        </strong>
      </span>
      <span className="pokemon-metadata">
        <span
          data-label="Tipos"
          className="type-list"
          style={pokemonTransitionStyle(transitionActive, 'types')}
        >
          {pokemon.types.map((type) => (
            <span className={`type type-${type}`} key={type}>
              {displayName(type)}
            </span>
          ))}
        </span>
        <span data-label="Generación" className="pokemon-generation">
          {generationLabel(pokemon.generation)}
        </span>
      </span>
      <Link
        to="/app/pokedex/$pokemonId"
        params={{ pokemonId: String(pokemon.pokemonId) }}
        search={{ ...search, from: 'catalog' }}
        className="row-link"
        aria-label={`Abrir ficha de ${displayName(pokemon.name)}`}
        resetScroll={false}
        viewTransition={{ types: ['pokemon-detail'] }}
      >
        <span className="row-link-label">Abrir ficha</span>
        <i className="hn hn-arrow-right" aria-hidden="true" />
      </Link>
    </div>
  )
}
