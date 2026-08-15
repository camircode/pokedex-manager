import { createFileRoute, Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'

import { PasswordField } from '@/components/password-field'
import { authClient } from '@/lib/auth-client'
import { AuthPage } from '@/routes/sign-in'

export const Route = createFileRoute('/sign-up')({ component: SignUp })

function SignUp() {
  const router = useRouter()
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    const data = new FormData(event.currentTarget)
    const result = await authClient.signUp.email({
      name: String(data.get('name')),
      email: String(data.get('email')),
      password: String(data.get('password')),
    })
    setPending(false)
    if (result.error) {
      setError(
        'No se pudo crear la cuenta. Revisa los datos o usa otro correo.',
      )
      return
    }
    await router.navigate({ to: '/app' })
  }
  return (
    <AuthPage
      title="Crea tu registro"
      note="El acceso local funciona con correo y contraseña; no requiere OAuth."
    >
      <form className="auth-form" onSubmit={submit}>
        <label>
          Nombre
          <input name="name" autoComplete="name" maxLength={60} required />
        </label>
        <label>
          Correo electrónico
          <input name="email" type="email" autoComplete="email" required />
        </label>
        <PasswordField
          autoComplete="new-password"
          describedBy="password-help"
        />
        <small id="password-help">Usa al menos 8 caracteres.</small>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="button primary" disabled={pending}>
          <i className="hn hn-user-plus" aria-hidden="true" />
          {pending ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
      <p className="auth-switch">
        ¿Ya tienes cuenta? <Link to="/sign-in">Iniciar sesión</Link>
      </p>
    </AuthPage>
  )
}
