import { BrainCircuit, Check, LoaderCircle, Wrench } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'

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

export function AiReasoning({
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
