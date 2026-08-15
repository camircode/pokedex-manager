import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { PasswordField } from '@/components/password-field'
import { authClient } from '@/lib/auth-client'

export const Route = createFileRoute('/sign-in')({ component: SignIn })

function SignIn() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const result = await authClient.signIn.email({
      email: String(data.get('email')),
      password: String(data.get('password')),
    })
    setPending(false)
    if (result.error) {
      setError('Correo o contraseña incorrectos.')
      return
    }
    await router.navigate({ to: '/app' })
  }

  return (
    <AuthPage title="Inicia sesión" note="Continúa con tu registro personal.">
      <form className="auth-form" onSubmit={submit}>
        <label>
          Correo electrónico
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <PasswordField autoComplete="current-password" />
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary" disabled={pending}>
          <i className="hn hn-user-check" aria-hidden="true" />
          {pending ? 'Verificando…' : 'Iniciar sesión'}
        </button>
      </form>
      <p className="auth-switch">
        ¿Aún no tienes cuenta? <Link to="/sign-up">Crear cuenta</Link>
      </p>
    </AuthPage>
  )
}

export function AuthPage({
  title,
  note,
  children,
}: {
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <main className="auth-page">
      <Link to="/" className="wordmark">
        <span className="wordmark-mark" aria-hidden="true">
          PM
        </span>{' '}
        Pokédex Manager
      </Link>
      <section className="auth-panel">
        <p className="kicker">Acceso al registro</p>
        <h1>{title}</h1>
        <p>{note}</p>
        {children}
      </section>
    </main>
  )
}
