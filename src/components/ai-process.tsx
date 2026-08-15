import { useEffect, useState } from 'react'

export type AiProcessStep = {
  phase: string
  label: string
}

export function AiProcess({
  title,
  steps,
  phases,
  status,
  startedAt,
}: {
  title: string
  steps: AiProcessStep[]
  phases: string[]
  status: 'running' | 'complete' | 'error'
  startedAt: number | null
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
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

  const activePhase = phases.at(-1)
  const activeIndex = steps.findIndex((step) => step.phase === activePhase)

  return (
    <section className="ai-process-panel" aria-live="polite">
      <header>
        <div>
          <p className="report-label">Proceso de IA</p>
          <h2>{title}</h2>
        </div>
        <span className={`ai-process-state ${status}`}>
          {status === 'running'
            ? 'En curso'
            : status === 'complete'
              ? 'Verificado'
              : 'Interrumpido'}{' '}
          · {elapsedSeconds} s
        </span>
      </header>
      <ol className="ai-process-steps">
        {steps.map((step, index) => {
          const active = running && index === activeIndex
          const failed = status === 'error' && index === activeIndex
          const complete =
            !active && !failed && activeIndex >= index && status !== 'error'
              ? true
              : status === 'error' && index < activeIndex
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
              <span className="ai-process-marker" aria-hidden="true">
                {complete ? '✓' : failed ? '!' : active ? '•' : '○'}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>
                  {complete
                    ? 'Completado'
                    : failed
                      ? 'No completado'
                      : active
                        ? 'Procesando ahora'
                        : 'Pendiente'}
                </small>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
