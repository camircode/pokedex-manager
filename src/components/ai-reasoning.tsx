import { useEffect, useId, useState } from 'react'

export type AiReasoningStep = {
  phase: string
  label: string
}

export function AiReasoning({
  className,
  title,
  steps,
  phases,
  status,
  startedAt,
}: {
  className?: string
  title: string
  steps: AiReasoningStep[]
  phases: string[]
  status: 'running' | 'complete' | 'error'
  startedAt: number | null
}) {
  const contentId = useId()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const running = status === 'running'

  useEffect(() => {
    if (startedAt === null) return
    const update = () => {
      setElapsedSeconds(
        Math.max(0, Math.floor((Date.now() - startedAt) / 1_000)),
      )
    }
    update()
    if (!running) return
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [running, startedAt])

  useEffect(() => {
    if (running) setExpanded(true)
  }, [running])

  const visibleSteps = steps.filter((step) => phases.includes(step.phase))
  const activePhase = phases.at(-1)

  return (
    <section
      className={`ai-reasoning-panel${className ? ` ${className}` : ''}`}
      aria-live="polite"
    >
      <button
        type="button"
        className="ai-reasoning-toggle"
        aria-controls={contentId}
        aria-expanded={expanded}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="ai-reasoning-summary-mark" aria-hidden="true">
          {running ? '•' : status === 'complete' ? '✓' : '!'}
        </span>
        <span className="ai-reasoning-summary-copy">
          <span className="report-label">Razonamiento de IA</span>
          <strong className="ai-reasoning-summary-title">{title}</strong>
        </span>
        <span className={`ai-reasoning-state ${status}`}>
          {status === 'running'
            ? 'En curso'
            : status === 'complete'
              ? 'Verificado'
              : 'Interrumpido'}{' '}
          · {elapsedSeconds} s
        </span>
        <span
          className={`ai-reasoning-chevron${expanded ? ' expanded' : ''}`}
          aria-hidden="true"
        />
      </button>

      <div id={contentId} className="ai-reasoning-body" hidden={!expanded}>
        <ol className="ai-reasoning-steps">
          {visibleSteps.map((step) => {
            const active = running && step.phase === activePhase
            const failed = status === 'error' && step.phase === activePhase
            const complete = !active && !failed
            return (
              <li
                className={
                  active
                    ? 'active'
                    : failed
                      ? 'error'
                      : complete
                        ? 'complete'
                        : 'waiting'
                }
                key={step.phase}
              >
                <span className="ai-reasoning-marker" aria-hidden="true">
                  {active ? (
                    <span className="thinking-dots">
                      <span />
                      <span />
                      <span />
                    </span>
                  ) : complete ? (
                    '✓'
                  ) : (
                    '!'
                  )}
                </span>
                <div>
                  <strong>{step.label}</strong>
                  <small>
                    {complete
                      ? 'Completado'
                      : failed
                        ? 'No completado'
                        : 'Procesando ahora'}
                  </small>
                </div>
              </li>
            )
          })}
          {visibleSteps.length === 0 && running && (
            <li className="active">
              <span className="ai-reasoning-marker" aria-hidden="true">
                <span className="thinking-dots">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
              <div>
                <strong>Preparar el contexto</strong>
                <small>Procesando ahora</small>
              </div>
            </li>
          )}
          {visibleSteps.length === 0 && status === 'error' && (
            <li className="error">
              <span className="ai-reasoning-marker" aria-hidden="true">
                !
              </span>
              <div>
                <strong>La solicitud no pudo comenzar</strong>
                <small>No completado</small>
              </div>
            </li>
          )}
        </ol>
      </div>
    </section>
  )
}
