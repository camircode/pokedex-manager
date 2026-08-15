import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { EmptyState, ErrorState, LoadingState } from '@/components/status'
import { consumeEventStream } from '@/lib/event-stream'
import { useApi } from '@/lib/ui'
import type {
  AssistantActivityEvent,
  AssistantCapability,
  AssistantConversation,
  AssistantMessage,
  AssistantStreamEvent,
  AssistantToolOperation,
} from '@/server/assistant'

export const Route = createFileRoute('/app/assistant')({
  component: Assistant,
})

type AssistantHistory = {
  capability: AssistantCapability
  conversations: AssistantConversation[]
  messages?: AssistantMessage[]
}

const toolLabels: Record<AssistantToolOperation['name'], string> = {
  search_pokemon: 'Buscar en PokéAPI',
  get_pokemon: 'Consultar ficha Pokémon',
  list_my_collection: 'Leer colección',
  get_collection_stats: 'Calcular estadísticas',
  compare_pokemon: 'Comparar Pokémon',
  get_research_progress: 'Consultar investigación',
}

function operationDetail(operation: AssistantToolOperation) {
  const label = toolLabels[operation.name] ?? operation.name
  const values = Object.values(operation.input).map(String)
  return values.length === 0 ? label : `${label}: ${values.join(' · ')}`
}

function citationAnchor(messageId: string, citationId: number) {
  return `message-${messageId}-source-${citationId}`
}

function citationMarkdown(message: AssistantMessage) {
  const citationIds = new Set(message.citations.map((citation) => citation.id))
  return message.content.replace(/\[(\d+)]/g, (reference, value: string) => {
    const id = Number(value)
    return citationIds.has(id)
      ? `[Fuente ${id}](#${citationAnchor(message.id, id)})`
      : reference
  })
}

function AssistantMarkdown({ message }: { message: AssistantMessage }) {
  return (
    <div className="message-markdown">
      <Markdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          a({ href, children, ...props }) {
            const citation = href?.startsWith('#message-') === true
            return (
              <a
                {...props}
                href={href}
                className={citation ? 'citation-link' : undefined}
                target={citation ? undefined : '_blank'}
                rel={citation ? undefined : 'noreferrer'}
                onClick={
                  citation
                    ? (event) => {
                        const target = document.getElementById(
                          href?.slice(1) ?? '',
                        )
                        const details = target?.closest('details')
                        if (details instanceof HTMLDetailsElement) {
                          event.preventDefault()
                          details.open = true
                          target?.scrollIntoView({ block: 'nearest' })
                        }
                      }
                    : undefined
                }
              >
                {children}
              </a>
            )
          },
          img() {
            return null
          },
        }}
      >
        {citationMarkdown(message)}
      </Markdown>
    </div>
  )
}

function Sources({ message }: { message: AssistantMessage }) {
  if (message.toolCalls.length === 0 && message.citations.length === 0) {
    return null
  }
  return (
    <details className="assistant-process">
      <summary>
        Proceso MCP · {message.toolCalls.length} herramienta
        {message.toolCalls.length === 1 ? '' : 's'} · {message.citations.length}{' '}
        fuente{message.citations.length === 1 ? '' : 's'}
      </summary>
      {message.toolCalls.length > 0 && (
        <ol className="tool-call-list">
          {message.toolCalls.map((operation) => (
            <li key={JSON.stringify(operation)}>
              <i className="hn hn-cog" aria-hidden="true" />
              <span>
                {operationDetail(operation)} <code>{operation.name}</code>
              </span>
            </li>
          ))}
        </ol>
      )}
      {message.citations.length > 0 && (
        <ol className="citation-list">
          {message.citations.map((citation) => (
            <li id={citationAnchor(message.id, citation.id)} key={citation.id}>
              <span>Fuente {citation.id}</span>
              <div>
                <strong>{citation.label}</strong>
                <p>{citation.fact}</p>
                {citation.href ? (
                  <a href={citation.href}>Abrir fuente</a>
                ) : (
                  <small>Origen: {citation.source}</small>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}

function MessageEntry({ message }: { message: AssistantMessage }) {
  return (
    <li className={`message ${message.role}`}>
      <span className="message-role">
        {message.role === 'user' ? 'Tú' : 'Asistente'}
      </span>
      {message.role === 'assistant' ? (
        <AssistantMarkdown message={message} />
      ) : (
        <p>{message.content}</p>
      )}
      {message.role === 'assistant' && <Sources message={message} />}
    </li>
  )
}

function AssistantActivity({
  events,
  elapsedSeconds,
}: {
  events: AssistantActivityEvent[]
  elapsedSeconds: number
}) {
  const phase = [...events].reverse().find((event) => event.type === 'status')
  const label =
    phase?.type === 'status' && phase.phase === 'writing'
      ? 'Redactando respuesta'
      : 'Analizando la consulta'
  const operations = events.filter(
    (event): event is Extract<AssistantActivityEvent, { type: 'tool_call' }> =>
      event.type === 'tool_call',
  )
  const results = events.filter(
    (
      event,
    ): event is Extract<AssistantActivityEvent, { type: 'tool_result' }> =>
      event.type === 'tool_result',
  )

  return (
    <li className="message assistant pending">
      <span className="message-role">Asistente</span>
      <div className="thinking-status" role="status">
        <span className="thinking-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <strong>{label}</strong>
        <span>{elapsedSeconds} s</span>
      </div>
      {(operations.length > 0 || results.length > 0) && (
        <details className="assistant-activity" open>
          <summary>Actividad MCP</summary>
          <ol>
            {operations.map((event, index) => {
              const result = results[index]
              return (
                <li key={JSON.stringify(event.operation)}>
                  <i
                    className={`hn ${result ? 'hn-check' : 'hn-cog'}`}
                    aria-hidden="true"
                  />
                  <div>
                    <strong>{operationDetail(event.operation)}</strong>
                    <code>{event.operation.name}</code>
                    <span>
                      {result
                        ? `${result.citations.length} fuente${result.citations.length === 1 ? '' : 's'} verificada${result.citations.length === 1 ? '' : 's'}`
                        : 'Consultando…'}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>
        </details>
      )}
    </li>
  )
}

function parseStreamEvent(value: string): AssistantStreamEvent {
  const parsed = JSON.parse(value) as unknown
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('type' in parsed) ||
    typeof parsed.type !== 'string'
  ) {
    throw new Error('Respuesta de streaming inválida.')
  }
  return parsed as AssistantStreamEvent
}

function Assistant() {
  const [conversationId, setConversationId] = useState('')
  const [version, setVersion] = useState(0)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [activity, setActivity] = useState<AssistantActivityEvent[]>([])
  const [pendingUserMessage, setPendingUserMessage] = useState('')
  const [completedMessage, setCompletedMessage] = useState<AssistantMessage>()
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [followResponse, setFollowResponse] = useState(false)
  const threadEndRef = useRef<HTMLDivElement>(null)
  const query = conversationId
    ? `?conversationId=${conversationId}&version=${version}`
    : `?version=${version}`
  const history = useApi<AssistantHistory>(`/api/assistant${query}`)
  const completedPersisted =
    completedMessage !== undefined &&
    history.data?.messages?.some(
      (entry) => entry.id === completedMessage.id,
    ) === true

  useEffect(() => {
    if (!sending) return
    const startedAt = Date.now()
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000))
    }, 1_000)
    return () => window.clearInterval(timer)
  }, [sending])

  useLayoutEffect(() => {
    if (!followResponse) return
    threadEndRef.current?.scrollIntoView({
      behavior: 'instant',
      block: 'end',
    })
  })

  useEffect(() => {
    if (!followResponse) return
    if (completedPersisted) {
      setPendingUserMessage('')
      setCompletedMessage(undefined)
      setFollowResponse(false)
    } else if (!sending && error) {
      setFollowResponse(false)
    }
  }, [completedPersisted, error, followResponse, sending])

  async function send() {
    const content = message.trim()
    if (content.length === 0 || sending) return
    setSending(true)
    setError('')
    setActivity([])
    setCompletedMessage(undefined)
    setElapsedSeconds(0)
    setPendingUserMessage(content)
    setMessage('')
    setFollowResponse(true)
    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: {
          Accept: 'text/event-stream',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: content,
          conversationId: conversationId || undefined,
        }),
      })
      if (!response.ok || response.body === null) {
        const body = (await response.json()) as { error?: string }
        throw new Error(body.error ?? 'No se pudo enviar la consulta.')
      }

      await consumeEventStream<AssistantStreamEvent>(
        response,
        (event) => {
          if (event.type === 'error') throw new Error(event.message)
          if (event.type === 'complete') {
            setCompletedMessage(event.message)
            setConversationId(event.conversationId)
            setVersion((current) => current + 1)
          } else {
            setActivity((current) => [...current, event])
          }
        },
        {
          isTerminal: (event) =>
            event.type === 'complete' || event.type === 'error',
          parse: parseStreamEvent,
        },
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No se pudo enviar.')
      setMessage(content)
      setPendingUserMessage('')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="page wide-page assistant-page">
      <header className="page-header">
        <div>
          <p className="kicker">Herramientas contextuales</p>
          <h1>Asistente de colección</h1>
          <p>
            {history.data?.capability.kimi
              ? `Kimi ${history.data.capability.model} conversa contigo y consulta herramientas MCP verificables para responder con datos citados.`
              : 'Modo local conectado por MCP al catálogo, tu colección y la investigación activa.'}
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setConversationId('')
            setMessage('')
            setError('')
            setActivity([])
            setPendingUserMessage('')
            setCompletedMessage(undefined)
            setFollowResponse(false)
          }}
        >
          <i className="hn hn-plus" aria-hidden="true" />
          Nueva conversación
        </button>
      </header>

      <div className="assistant-workspace">
        <aside className="conversation-index" aria-label="Conversaciones">
          <h2>Historial</h2>
          <label className="conversation-picker">
            Conversación
            <select
              value={conversationId}
              onChange={(event) => {
                setConversationId(event.target.value)
                setError('')
              }}
            >
              <option value="">Sin conversación seleccionada</option>
              {history.data?.conversations.map((conversation) => (
                <option value={conversation.id} key={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
          </label>
          {history.loading && <LoadingState label="Cargando historial…" />}
          {!history.loading && history.data?.conversations.length === 0 && (
            <p className="conversation-empty">Aún no hay conversaciones.</p>
          )}
          <ol>
            {history.data?.conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  className={conversation.id === conversationId ? 'active' : ''}
                  aria-current={
                    conversation.id === conversationId ? 'true' : undefined
                  }
                  onClick={() => {
                    setConversationId(conversation.id)
                    setError('')
                  }}
                >
                  <strong>{conversation.title}</strong>
                  <span>
                    {new Date(conversation.updatedAt).toLocaleDateString('es')}
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <section className="assistant-thread" aria-label="Conversación actual">
          {history.error && <ErrorState message={history.error} />}
          {error && <ErrorState message={error} />}
          {!conversationId && !history.loading && (
            <EmptyState title="Consulta datos de tu registro">
              {history.data?.capability.kimi
                ? 'Pregunta con tus propias palabras sobre Pokémon, tu colección o la investigación activa.'
                : 'Prueba con “busca pikachu”, “mi colección”, “estadísticas”, “compara pikachu con raichu” o “investigación”.'}
            </EmptyState>
          )}
          {conversationId && history.loading && (
            <LoadingState label="Cargando conversación…" />
          )}
          <ol className="message-ledger" aria-live="polite">
            {history.data?.messages?.map((entry) => (
              <MessageEntry message={entry} key={entry.id} />
            ))}
            {pendingUserMessage && !completedPersisted && (
              <li className="message user pending-user">
                <span className="message-role">Tú</span>
                <p>{pendingUserMessage}</p>
              </li>
            )}
            {sending && (
              <AssistantActivity
                events={activity}
                elapsedSeconds={elapsedSeconds}
              />
            )}
            {completedMessage && !completedPersisted && (
              <MessageEntry message={completedMessage} />
            )}
          </ol>

          <form
            className="assistant-composer"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <label htmlFor="assistant-message">Tu consulta</label>
            <textarea
              id="assistant-message"
              value={message}
              rows={3}
              maxLength={500}
              placeholder="Ej.: compara pikachu con raichu"
              disabled={sending}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault()
                  void send()
                }
              }}
            />
            <div>
              <small>Enter para enviar · Mayús + Enter para nueva línea</small>
              <button
                type="submit"
                className="button primary"
                disabled={sending || message.trim().length === 0}
              >
                <i className="hn hn-message-dots" aria-hidden="true" />
                {sending ? 'Enviando…' : 'Enviar consulta'}
              </button>
            </div>
          </form>
          <div
            ref={threadEndRef}
            className="assistant-thread-end"
            aria-hidden="true"
          />
        </section>
      </div>
    </main>
  )
}
