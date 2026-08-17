import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { AiMarkdown } from '@/components/ai-markdown'
import { AiReasoning, reasoningItems } from '@/components/ai-reasoning'
import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { pokemonTypeLabel } from '@/lib/catalog-query'
import { consumeEventStream } from '@/lib/event-stream'
import { useApi } from '@/lib/ui'
import type { InsightsStreamEvent } from '@/routes/api/insights'
import type { InsightsResponse } from '@/server/insights'

export const Route = createFileRoute('/app/insights')({ component: Insights })

function Insights() {
  const [version, setVersion] = useState(0)
  const [generating, setGenerating] = useState(false)
  const [generationError, setGenerationError] = useState('')
  const [reasoning, setReasoning] = useState('')
  const state = useApi<InsightsResponse>(`/api/insights?version=${version}`)
  const dominant = state.data?.stats.typeDistribution[0]
  const diversity = state.data?.stats.typeDistribution.length ?? 0

  async function generate() {
    if (generating || state.data?.stats.totalUnique === 0) return
    setGenerating(true)
    setGenerationError('')
    setReasoning('')
    try {
      const response = await fetch('/api/insights', {
        method: 'POST',
        headers: { Accept: 'text/event-stream' },
      })
      await consumeEventStream<InsightsStreamEvent>(
        response,
        (event) => {
          if (event.type === 'reasoning') {
            setReasoning((current) => current + event.delta)
          } else if (event.type === 'error') {
            throw new Error(event.message)
          } else {
            setVersion((value) => value + 1)
          }
        },
        {
          isTerminal: (event) =>
            event.type === 'complete' || event.type === 'error',
        },
      )
    } catch (error) {
      setGenerationError(
        error instanceof Error
          ? error.message
          : 'No se pudo generar el análisis.',
      )
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="page insights-page">
      <header className="page-header">
        <div>
          <p className="kicker">Lectura fundamentada</p>
          <h1>Hallazgos</h1>
          <p>
            El servidor calcula la evidencia; Kimi la interpreta sin inventar
            métricas ni especies.
          </p>
        </div>
        <div className="research-generation-action">
          <button
            type="button"
            className="button primary"
            disabled={
              !state.data?.capability.kimi ||
              state.data.stats.totalUnique === 0 ||
              generating
            }
            onClick={() => void generate()}
          >
            <i className="hn hn-sparkles" aria-hidden="true" />
            {generating
              ? 'Analizando…'
              : state.data?.analysis
                ? 'Regenerar hallazgos'
                : 'Analizar con IA'}
          </button>
          <small>
            {state.data?.capability.kimi
              ? 'La evidencia calculada se conserva separada de la narrativa.'
              : 'Configura Kimi para interpretar la evidencia.'}
          </small>
        </div>
      </header>

      {state.loading && <LoadingState label="Leyendo la colección…" />}
      {state.error && <ErrorState message={state.error} />}
      {generationError && <ErrorState message={generationError} />}
      {(generating || reasoning.length > 0) && (
        <AiReasoning items={reasoningItems(reasoning)} streaming={generating} />
      )}

      {state.data?.stats.totalUnique === 0 && (
        <EmptyState title="Aún no hay evidencia suficiente">
          Agrega ejemplares para calcular hechos e interpretarlos con IA.
        </EmptyState>
      )}

      {state.data && state.data.stats.totalUnique > 0 && (
        <>
          <section
            className="insight-evidence"
            aria-labelledby="evidence-title"
          >
            <header>
              <p className="report-label">Evidencia calculada</p>
              <h2 id="evidence-title">Datos que Kimi puede utilizar</h2>
            </header>
            <dl>
              <div>
                <dt>Composición</dt>
                <dd>
                  {state.data.stats.totalUnique} especies ·{' '}
                  {state.data.stats.totalQuantity} ejemplares
                </dd>
              </div>
              <div>
                <dt>Diversidad</dt>
                <dd>
                  {diversity} tipos
                  {dominant
                    ? ` · mayor presencia ${pokemonTypeLabel(dominant.type)} (${dominant.count})`
                    : ''}
                </dd>
              </div>
              <div>
                <dt>Curaduría</dt>
                <dd>{state.data.stats.favorites} favoritas</dd>
              </div>
            </dl>
          </section>

          {state.data.analysis ? (
            <article className="insight-analysis">
              <header>
                <div className="expedition-provenance">
                  <span className="status-badge active">
                    Generado con Kimi · {state.data.analysis.model}
                  </span>
                </div>
                <p className="report-label">Interpretación narrativa</p>
                <h2>Lectura de tu colección</h2>
                <AiMarkdown content={state.data.analysis.narrative} />
              </header>
              <details className="insight-evidence-details">
                <summary>Datos calculados entregados a Kimi</summary>
                <dl>
                  {state.data.analysis.evidence.map((fact) => (
                    <div key={fact.key}>
                      <dt>{fact.label}</dt>
                      <dd>{fact.fact}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            </article>
          ) : (
            <EmptyState title="La evidencia está lista">
              Selecciona “Analizar con IA” para que Kimi interprete estos hechos
              y muestre el proceso completo.
            </EmptyState>
          )}
        </>
      )}
    </main>
  )
}
