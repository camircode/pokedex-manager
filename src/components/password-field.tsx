import { useId, useState } from 'react'

export function PasswordField({
  autoComplete,
  describedBy,
}: {
  autoComplete: 'current-password' | 'new-password'
  describedBy?: string
}) {
  const id = useId()
  const [visible, setVisible] = useState(false)

  return (
    <div className="form-field">
      <label htmlFor={id}>Contraseña</label>
      <span className="password-field">
        <input
          id={id}
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          minLength={8}
          required
          aria-describedby={describedBy}
        />
        <button
          type="button"
          className="password-toggle"
          aria-controls={id}
          aria-pressed={visible}
          onClick={() => setVisible((value) => !value)}
        >
          <i
            className={`hn ${visible ? 'hn-eye-cross' : 'hn-eye'}`}
            aria-hidden="true"
          />
          {visible ? 'Ocultar' : 'Mostrar'}
        </button>
      </span>
    </div>
  )
}
