import { BrainCircuit, Check, LoaderCircle, Wrench } from 'lucide-react'
import { type ReactNode, useEffect, useId, useState } from 'react'

import { AiMarkdown } from '@/components/ai-markdown'
import {
  Steps,
  StepsContent,
  StepsItem,
  StepsTrigger,
} from '@/components/prompt-kit/steps'

export type AiReasoningItem = {
  id: string
  content: ReactNode
  detail?: ReactNode
  kind?: 'reasoning' | 'tool'
}

export function reasoningItems(content: string): AiReasoningItem[] {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => ({
      id: `reasoning-${index}`,
      content: <AiMarkdown content={block} />,
      kind: 'reasoning' as const,
    }))
}

function PromptReasoning({
  className,
  title = 'Razonamiento de Kimi',
  items,
  streaming,
}: {
  className?: string
  title?: string
  items: AiReasoningItem[]
  streaming: boolean
}) {
  const [open, setOpen] = useState(true)

  useEffect(() => {
    if (streaming) setOpen(true)
  }, [streaming])

  return (
    <Steps
      className={`ai-reasoning${className ? ` ${className}` : ''}`}
      open={open}
      onOpenChange={setOpen}
    >
      <StepsTrigger
        leftIcon={
          streaming ? (
            <LoaderCircle className="ai-reasoning-icon spinning" />
          ) : (
            <BrainCircuit className="ai-reasoning-icon" />
          )
        }
      >
        <span className="ai-reasoning-title">{title}</span>
        <span className="ai-reasoning-state">
          {streaming ? 'Pensando…' : 'Razonamiento recibido'}
        </span>
      </StepsTrigger>
      <StepsContent>
        {items.map((item) => (
          <StepsItem
            className={`ai-reasoning-item ${item.kind ?? 'reasoning'}`}
            key={item.id}
          >
            <span className="ai-reasoning-item-icon" aria-hidden="true">
              {item.kind === 'tool' ? (
                <Wrench />
              ) : streaming && item.id === items.at(-1)?.id ? (
                <LoaderCircle className="spinning" />
              ) : (
                <Check />
              )}
            </span>
            <div>
              {item.content}
              {item.detail && (
                <small className="ai-reasoning-item-detail">
                  {item.detail}
                </small>
              )}
            </div>
          </StepsItem>
        ))}
        {items.length === 0 && streaming && (
          <StepsItem className="ai-reasoning-item waiting">
            <span className="ai-reasoning-item-icon" aria-hidden="true">
              <LoaderCircle className="spinning" />
            </span>
            <span>Esperando el razonamiento de Kimi…</span>
          </StepsItem>
        )}
      </StepsContent>
    </Steps>
  )
}


export type AiReasoningStep = {
  phase: string
  label: string
}

function LegacyAiReasoning({
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

type PromptReasoningProps = Parameters<typeof PromptReasoning>[0]
type LegacyReasoningProps = Parameters<typeof LegacyAiReasoning>[0]

export function AiReasoning(
  props: PromptReasoningProps | LegacyReasoningProps,
) {
  return 'items' in props ? (
    <PromptReasoning {...props} />
  ) : (
    <LegacyAiReasoning {...props} />
  )
}
