import { useEffect, useRef, useState } from 'react'

export function displayName(value: string) {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function useApi<T>(url: string) {
  const [state, setState] = useState<{
    data?: T
    error?: string
    loading: boolean
  }>({ loading: true })

  useEffect(() => {
    const controller = new AbortController()
    setState({ loading: true })
    fetch(url, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json()) as T & { error?: string }
        if (!response.ok) throw new Error(body.error ?? 'No se pudo cargar.')
        setState({ data: body, loading: false })
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            error:
              error instanceof Error ? error.message : 'No se pudo cargar.',
            loading: false,
          })
        }
      })
    return () => controller.abort()
  }, [url])

  return state
}

export function useResponsiveDetails(query = '(min-width: 721px)') {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    const media = window.matchMedia(query)
    const syncDisclosure = () => {
      if (ref.current) ref.current.open = media.matches
    }

    syncDisclosure()
    media.addEventListener('change', syncDisclosure)
    return () => media.removeEventListener('change', syncDisclosure)
  }, [query])

  return ref
}

export async function apiMutation<T>(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  })
  if (response.status === 204) return undefined as T
  const body = (await response.json()) as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? 'No se pudo guardar.')
  return body
}
