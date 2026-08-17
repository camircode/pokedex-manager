import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'

import { AiReasoning, type AiReasoningStep } from '@/components/ai-reasoning'
import { AiMarkdown } from '@/components/ai-markdown'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { catalogSearchDefaults } from '@/lib/catalog-query'
import { consumeEventStream } from '@/lib/event-stream'
import { useApi } from '@/lib/ui'
import type { ResearchStreamEvent } from '@/routes/api/research'
import type { ResearchResponse } from '@/server/research'

export const Route = createFileRoute('/app/research')({ component: Research })

const researchSteps: AiReasoningStep[] = [
  { phase: 'collecting', label: 'Leer el estado actual de la colección' },
  { phase: 'preparing', label: 'Preparar el contexto verificable' },
  { phase: 'generating', label: 'Kimi escribe la narrativa' },
  { phase: 'validating', label: 'Validar el resultado y el progreso' },
  { phase: 'persisting', label: 'Guardar la expedición' },
]

function Research() {
  const [version, setVersion] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [processPhases, setProcessPhases] = useState<string[]>([])
  const [processStatus, setProcessStatus] = useState<
    'running' | 'complete' | 'error'
  >('complete')
  const [processStartedAt, setProcessStartedAt] = useState<number | null>(null)
  const state = useApi<ResearchResponse>(`/api/research?version=${version}`)
  const expedition = state.data?.expedition

  async function generate() {
    if (generating) return
    const replacing = expedition !== null && expedition !== undefined
    if (
      replacing &&
      !window.confirm(
        'Esta acción reemplazará la expedición generada con Kimi. ¿Deseas continuar?',
      )
    ) {
      return
    }

    setGenerating(true)
    setGenerationError('')
    setProcessPhases([])
    setProcessStatus('running')
    setProcessStartedAt(Date.now())
    try {
      const response = await fetch('/api/research', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
      })
      await consumeEventStream<ResearchStreamEvent>(
        response,
        (event) => {
          if (event.type === 'phase') {
            setProcessPhases((current) =>
              current.includes(event.phase)
                ? current
                : [...current, event.phase],
            )
          } else if (event.type === 'error') {
            throw new Error(event.message)
          } else {
            setProcessStatus('complete')
            setVersion((value) => value + 1)
          }
        },
        { isTerminal: (event) => event.type !== 'phase' },
      )
    } catch (error) {
      setProcessStatus('error')
      setGenerationError(
        error instanceof Error
          ? error.message
          : 'No se pudo generar la expedición.',
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="page research-page">
      <header className="page-header">
        <div>
          <p className="kicker">Expedición adaptativa</p>
          <h1>Investigación activa</h1>
          <p>
            Kimi escribe una narrativa abierta a partir de tu colección. El
            servidor conserva los objetivos verificables y calcula el progreso
            sin confundir la interpretación con los datos.
          </p>
        </div>
        <div className="research-generation-action">
          <button
            type="button"
            className="button primary"
            disabled={!state.data?.capability.kimi || generating}
            aria-describedby={
              state.data?.capability.kimi
                ? 'research-generation-help'
                : 'research-generation-disabled'
            }
            onClick={() => void generate()}
          >
            <i className="hn hn-sparkles" aria-hidden="true" />
            {generating
              ? 'Generando…'
              : expedition
                ? 'Regenerar con IA'
                : 'Generar con IA'}
          </button>
          {state.data?.capability.kimi ? (
            <small id="research-generation-help">
              La narrativa se validará antes de guardarla; el servidor conserva
              el progreso.
            </small>
          ) : (
            <small id="research-generation-disabled">
              Configura Kimi para generar una investigación.
            </small>
          )}
        </div>
      </header>
      {state.loading && <LoadingState label="Preparando la expedición…" />}
      {state.error && <ErrorState message={state.error} />}
      {generationError && <ErrorState message={generationError} />}
      {processStartedAt !== null && (
        <AiReasoning
          title="Construcción de la expedición"
          steps={researchSteps}
          phases={processPhases}
          status={processStatus}
          startedAt={processStartedAt}
        />
      )}
      {!state.loading && !state.error && expedition === null && (
        <EmptyState title="Aún no hay una investigación activa">
          Genera una expedición con IA para crear una narrativa y objetivos
          verificados a partir de tu colección.
        </EmptyState>
      )}
      {expedition && (
        <article className="expedition-sheet">
          <header>
            <div className="expedition-provenance">
              <span className={`status-badge ${expedition.status}`}>
                {expedition.status === 'active' ? 'En curso' : 'Completada'}
              </span>
              {expedition.generation.mode === 'kimi' && (
                <span className="status-badge active">
                  Generada con Kimi · {expedition.generation.model}
                </span>
              )}
            </div>
            <p className="report-label">Narrativa generada</p>
            <h2>Investigación de colección</h2>
            <AiMarkdown content={expedition.narrative} />
          </header>
          <section className="expedition-objectives">
            <header>
              <p className="report-label">Servidor</p>
              <h3>Progreso verificable</h3>
            </header>
            <ol className="objective-list">
              {expedition.objectives.map((objective) => (
                <li
                  key={objective.key}
                  className={objective.complete ? 'complete' : ''}
                >
                  <span className="objective-mark" aria-hidden="true">
                    {objective.complete ? '✓' : '○'}
                  </span>
                  <div>
                    <strong>{objective.label}</strong>
                    <span>
                      {Math.min(objective.progress, objective.target)} de{' '}
                      {objective.target}
                    </span>
                    <progress
                      value={Math.min(objective.progress, objective.target)}
                      max={objective.target}
                    >
                      {objective.progress}/{objective.target}
                    </progress>
                  </div>
                </li>
              ))}
            </ol>
          </section>
          <footer>
            <p>
              Kimi escribe la narrativa; el servidor conserva los objetivos,
              calcula el avance y mantiene el estado de la expedición.
            </p>
            <Link
              to="/app/pokedex"
              search={catalogSearchDefaults}
              className="button primary"
            >
              <i className="hn hn-search" aria-hidden="true" />
              Explorar el índice
            </Link>
          </footer>
        </article>
      )}
    </main>
  )
}
