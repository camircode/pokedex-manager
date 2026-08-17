import { type ReactNode, useEffect, useState } from 'react'

import { AiMarkdown } from '@/components/ai-markdown'
import { ModelContextProtocol } from '@/components/model-context-protocol'
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

function reasoningTitle(block: string, index: number) {
  const clean = (value: string) =>
    value
      .replace(/[*_`#>[\]]/g, '')
      .replace(/^[-+•]\s+/, '')
      .replace(/\s+/g, ' ')
      .trim()
  const firstLine = block.split('\n').map(clean).find(Boolean)
  if (firstLine?.endsWith(':') || (firstLine?.length ?? 0) <= 56) {
    return firstLine ?? `Paso ${index + 1}`
  }
  const plain = block
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .map(clean)
    .join(' ')
  if (plain.length === 0) return `Paso ${index + 1}`
  const sentence = plain.match(/^.{1,96}?[.!?](?:\s|$)/)?.[0]?.trim()
  const title = sentence ?? plain
  return title.length <= 96 ? title : `${title.slice(0, 93).trimEnd()}…`
}

export function reasoningItems(content: string): AiReasoningItem[] {
  return content
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, index) => ({
      id: `reasoning-${index}`,
      content: reasoningTitle(block, index),
      detail: <AiMarkdown content={block} />,
      kind: 'reasoning' as const,
    }))
}

function ReasoningStep({
  active,
  item,
}: {
  active: boolean
  item: AiReasoningItem
}) {
  const [open, setOpen] = useState(active)

  useEffect(() => {
    setOpen(active)
  }, [active])

  const icon =
    item.kind === 'tool' ? (
      <ModelContextProtocol className="ai-reasoning-mcp-icon" />
    ) : (
      <i className={active ? 'hn hn-refresh spinning' : 'hn hn-sparkles'} />
    )

  return (
    <StepsItem
      className={`ai-reasoning-item ${item.kind ?? 'reasoning'}${active ? ' active' : ''}`}
      icon={icon}
      open={open}
      onOpenChange={setOpen}
      title={item.content}
    >
      {item.detail && (
        <div className="ai-reasoning-item-detail">{item.detail}</div>
      )}
    </StepsItem>
  )
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
            <i className="hn hn-refresh ai-reasoning-icon spinning" />
          ) : (
            <i className="hn hn-check ai-reasoning-icon" />
          )
        }
      >
        <span className="ai-reasoning-title">{title}</span>
        <span className="ai-reasoning-state">
          {streaming ? 'Pensando…' : 'Razonamiento recibido'}
        </span>
      </StepsTrigger>
      <StepsContent>
        {items.map((item, index) => (
          <ReasoningStep
            active={streaming && index === items.length - 1}
            item={item}
            key={item.id}
          />
        ))}
        {items.length === 0 && streaming && (
          <StepsItem
            className="ai-reasoning-item waiting"
            icon={<i className="hn hn-refresh spinning" />}
            open
            title="Esperando el razonamiento de Kimi…"
          >
            <span>Kimi está preparando el primer paso.</span>
          </StepsItem>
        )}
      </StepsContent>
    </Steps>
  )
}
