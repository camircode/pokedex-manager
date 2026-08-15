export function LoadingState({
  label = 'Cargando registro…',
}: {
  label?: string
}) {
  return (
    <p className="status-line" aria-live="polite">
      {label}
    </p>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <p className="status-line error" role="alert">
      {message}
    </p>
  )
}

export function EmptyState({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{children}</p>
    </section>
  )
}
