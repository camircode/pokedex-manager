import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { pokemonTypeLabel } from '@/lib/catalog-query'
import { apiMutation, displayName, useApi } from '@/lib/ui'
import type { CollectionEntry } from '@/server/collection'

export const Route = createFileRoute('/app/collection')({
  component: Collection,
})

function Collection() {
  const [version, setVersion] = useState(0)
  const state = useApi<CollectionEntry[]>(`/api/collection?version=${version}`)
  const [error, setError] = useState('')
  async function save(entry: CollectionEntry, form: HTMLFormElement) {
    const data = new FormData(form)
    setError('')
    try {
      await apiMutation(`/api/collection/${entry.pokemonId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantity: Number(data.get('quantity')),
          nickname: String(data.get('nickname')).trim() || null,
          notes: String(data.get('notes')),
          tags: String(data.get('tags'))
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
          favorite: data.get('favorite') === 'on',
        }),
      })
      setVersion((value) => value + 1)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo guardar.')
    }
  }
  async function remove(entry: CollectionEntry) {
    if (
      !window.confirm(
        `¿Eliminar a ${displayName(entry.pokemon.name)} de la colección?`,
      )
    )
      return
    try {
      await apiMutation(`/api/collection/${entry.pokemonId}`, {
        method: 'DELETE',
      })
      setVersion((value) => value + 1)
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'No se pudo eliminar.',
      )
    }
  }
  return (
    <main className="page wide-page">
      <header className="page-header">
        <div>
          <p className="kicker">Inventario personal</p>
          <h1>Colección</h1>
          <p>Edita cada registro sin salir del listado.</p>
        </div>
      </header>
      {state.loading && <LoadingState />}
      {(state.error || error) && <ErrorState message={state.error ?? error} />}
      {state.data?.length === 0 && (
        <EmptyState title="No hay ejemplares registrados">
          Abre el índice Pokédex para agregar el primero.
        </EmptyState>
      )}
      <div className="collection-ledger">
        {state.data?.map((entry) => (
          <CollectionEntryForm
            key={entry.pokemonId}
            entry={entry}
            onSave={save}
            onRemove={remove}
          />
        ))}
      </div>
    </main>
  )
}

function CollectionEntryForm({
  entry,
  onSave,
  onRemove,
}: {
  entry: CollectionEntry
  onSave: (entry: CollectionEntry, form: HTMLFormElement) => Promise<void>
  onRemove: (entry: CollectionEntry) => Promise<void>
}) {
  return (
    <form
      className="collection-entry"
      onSubmit={(event) => {
        event.preventDefault()
        void onSave(entry, event.currentTarget)
      }}
    >
      <div className="collection-identity">
        {entry.pokemon.sprite && (
          <img src={entry.pokemon.sprite} alt="" width="72" height="72" />
        )}
        <div className="collection-identity-content">
          <div className="collection-heading">
            <div>
              <span className="index-number">
                #{String(entry.pokemonId).padStart(4, '0')}
              </span>
              <h2>{displayName(entry.pokemon.name)}</h2>
            </div>
            {entry.nickname && (
              <p className="collection-nickname">
                <span className="sr-only">Apodo: </span>“{entry.nickname}”
              </p>
            )}
          </div>
          <div className="collection-metadata">
            <span>
              {entry.quantity}{' '}
              {entry.quantity === 1 ? 'ejemplar' : 'ejemplares'}
            </span>
            {entry.favorite && (
              <span className="collection-favorite">Favorito</span>
            )}
          </div>
          <div className="type-list">
            {entry.pokemon.types.map((type) => (
              <span className={`type type-${type}`} key={type}>
                {pokemonTypeLabel(type)}
              </span>
            ))}
          </div>
          {entry.tags.length > 0 && (
            <ul className="collection-tags" aria-label="Etiquetas">
              {entry.tags.map((tag) => (
                <li key={tag}>#{tag}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <details className="collection-editor">
        <summary>
          <span>
            <i className="hn hn-edit" aria-hidden="true" />
            <span className="editor-label editor-label-closed">Editar</span>
            <span className="editor-label editor-label-open">
              Cerrar edición
            </span>
          </span>
          <i className="hn hn-chevron-down" aria-hidden="true" />
        </summary>
        <div className="collection-editor-body">
          <div className="collection-fields">
            <label>
              Cantidad
              <input
                name="quantity"
                type="number"
                min="1"
                max="999"
                defaultValue={entry.quantity}
              />
            </label>
            <label>
              Apodo
              <input
                name="nickname"
                maxLength={40}
                defaultValue={entry.nickname ?? ''}
              />
            </label>
            <label className="wide-field">
              Notas
              <textarea
                name="notes"
                maxLength={500}
                defaultValue={entry.notes}
                rows={2}
              />
            </label>
            <label className="wide-field">
              Etiquetas <small>separadas por comas</small>
              <input name="tags" defaultValue={entry.tags.join(', ')} />
            </label>
            <label className="check-field">
              <input
                name="favorite"
                type="checkbox"
                defaultChecked={entry.favorite}
              />{' '}
              Favorito
            </label>
          </div>
          <div className="entry-actions">
            <button type="submit" className="button primary">
              <i className="hn hn-save" aria-hidden="true" />
              Guardar
            </button>
            <button
              type="button"
              className="button danger"
              onClick={() => void onRemove(entry)}
            >
              <i className="hn hn-trash" aria-hidden="true" />
              Eliminar
            </button>
          </div>
        </div>
      </details>
    </form>
  )
}
