import '@tanstack/react-start/server-only'

import { getMongoClient } from '@/server/db/mongo-client'
import { createBetterAuth } from '@/server/integrations/better-auth'

type Auth = ReturnType<typeof createBetterAuth>

let authPromise: Promise<Auth> | undefined

export function getAuth() {
  if (authPromise !== undefined) return authPromise

  const pending = getMongoClient()
    .connect()
    .then((database) => createBetterAuth({ database }))
  authPromise = pending
  void pending.catch(() => {
    if (authPromise === pending) authPromise = undefined
  })
  return pending
}

export async function getSessionFromHeaders(headers: Headers) {
  return (await getAuth()).api.getSession({ headers })
}

export async function requireUser(headers: Headers) {
  const session = await getSessionFromHeaders(headers)
  if (session === null) throw new UnauthorizedError()
  return session.user
}

export class UnauthorizedError extends Error {
  readonly status = 401

  constructor() {
    super('Authentication required')
    this.name = 'UnauthorizedError'
  }
}

export function resetAuthForTests() {
  authPromise = undefined
}
