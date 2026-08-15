import { MongoClient } from 'mongodb'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { authApiHandler } from '../../src/routes/api/auth/$'
import { collectionHandler } from '../../src/routes/api/collection'
import { getSessionFromHeaders, resetAuthForTests } from '../../src/server/auth'
import { closeSharedMongoClient } from '../../src/server/db/mongo-client'

const mongoUri =
  process.env.MONGO_TEST_URI ??
  'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=2_000'
const databaseName = `pokedex_auth_route_${process.pid}_${Date.now()}`
const baseURL = 'http://127.0.0.1:3000'
const email = `auth-route-${process.pid}-${Date.now()}@example.test`
const client = new MongoClient(mongoUri, { serverSelectionTimeoutMS: 2_000 })

function sessionCookie(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[]
  }
  const values = headers.getSetCookie?.() ?? [
    response.headers.get('set-cookie') ?? '',
  ]
  const cookie = values.find((value) =>
    value.includes('better-auth.session_token='),
  )
  if (cookie === undefined) throw new Error('Session cookie missing')
  return cookie.split(';', 1)[0]
}

beforeAll(async () => {
  process.env.MONGO_MODE = 'local'
  process.env.MONGO_URI = mongoUri
  process.env.MONGO_DB_NAME = databaseName
  process.env.BETTER_AUTH_SECRET =
    'auth-route-test-secret-at-least-32-characters-long'
  process.env.BETTER_AUTH_URL = baseURL
  await client.connect()
})

afterAll(async () => {
  await client.db(databaseName).collection('session').deleteMany({})
  await client.db(databaseName).collection('account').deleteMany({})
  await client.db(databaseName).collection('user').deleteMany({})
  resetAuthForTests()
  await closeSharedMongoClient()
  await client.close()
})

describe('auth API route and session guard', () => {
  it('delega el alta a Better Auth y valida la sesión desde headers', async () => {
    const response = await authApiHandler(
      new Request(`${baseURL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Auth Route Test',
          email,
          password: 'deterministic-password-123!',
        }),
      }),
    )
    expect(response.status).toBe(200)
    const headers = new Headers({ cookie: sessionCookie(response) })
    await expect(getSessionFromHeaders(headers)).resolves.toMatchObject({
      user: { email },
    })
  })

  it('rechaza operaciones de colección sin sesión', async () => {
    const response = await collectionHandler(
      new Request(`${baseURL}/api/collection`),
    )
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({
      error: 'Debes iniciar sesión.',
    })
  })
})
