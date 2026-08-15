import { ZodError } from 'zod'

import { UnauthorizedError } from '@/server/auth'

const DEFAULT_JSON_BODY_BYTES = 64 * 1024

function requestError(message: string, status: number) {
  const error = new Error(message)
  Object.assign(error, { status })
  return error
}

export function assertTrustedMutation(request: Request) {
  const fetchSite = request.headers.get('sec-fetch-site')
  if (fetchSite === 'cross-site') {
    throw requestError('Origen de solicitud no permitido.', 403)
  }

  const origin = request.headers.get('origin')
  const requestOrigin = new URL(request.url).origin
  const publicUrl = process.env.BETTER_AUTH_URL
  const publicOrigin =
    publicUrl === undefined ? undefined : new URL(publicUrl).origin
  if (origin !== null && origin !== requestOrigin && origin !== publicOrigin) {
    throw requestError('Origen de solicitud no permitido.', 403)
  }
}

async function readRequestBody(request: Request, maxBytes: number) {
  const contentLength = request.headers.get('content-length')
  if (contentLength !== null) {
    const declaredLength = Number(contentLength)
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      throw requestError('El cuerpo de la solicitud es demasiado grande.', 413)
    }
  }

  if (request.body === null) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw requestError('El cuerpo de la solicitud es demasiado grande.', 413)
    }
    chunks.push(value)
  }

  const body = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}

export async function readJsonBody(
  request: Request,
  maxBytes = DEFAULT_JSON_BODY_BYTES,
) {
  const body = await readRequestBody(request, maxBytes)
  return JSON.parse(new TextDecoder().decode(body)) as unknown
}

export async function readFormDataBody(request: Request, maxBytes: number) {
  const body = await readRequestBody(request, maxBytes)
  const boundedRequest = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
  })
  return boundedRequest.formData()
}

export async function withLimitedBody(request: Request, maxBytes: number) {
  if (request.body === null) return request
  const body = await readRequestBody(request, maxBytes)
  return new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body,
    signal: request.signal,
  })
}

export function apiError(error: unknown) {
  if (error instanceof UnauthorizedError) {
    return Response.json({ error: 'Debes iniciar sesión.' }, { status: 401 })
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: 'Solicitud inválida.' }, { status: 400 })
  }
  if (error instanceof ZodError) {
    return Response.json(
      { error: 'Datos de entrada inválidos.' },
      { status: 400 },
    )
  }
  if (error instanceof Error && 'status' in error) {
    const status = Number((error as { status: unknown }).status)
    if (status >= 400 && status < 500) {
      return Response.json({ error: error.message }, { status })
    }
  }
  return Response.json(
    { error: 'No se pudo completar la operación.' },
    { status: 500 },
  )
}
