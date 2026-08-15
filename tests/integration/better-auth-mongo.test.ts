import type { Db } from 'mongodb'
import { afterEach, describe, expect, it } from 'vitest'
import { createMongoClient } from '../../src/server/db/mongo-client'
import { loadServerEnv } from '../../src/server/env.server'
import {
  type BetterAuthConfig,
  BetterAuthConfigurationError,
  createBetterAuth,
  loadBetterAuthConfig,
} from '../../src/server/integrations/better-auth'

const mongoUri =
  process.env.MONGO_TEST_URI ??
  'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=2_000'
const databaseName =
  process.env.MONGO_TEST_DB_NAME ?? `pokedex_task_3_1_${process.pid}`
const environment = loadServerEnv({
  MONGO_MODE: 'local',
  MONGO_URI: mongoUri,
  MONGO_DB_NAME: databaseName,
})

const fixture = {
  email: `task-3-1-${process.pid}@example.test`,
  name: 'Task 3.1 Better Auth Fixture',
  password: 'task-3-1-deterministic-password-123!',
}

const fixtureConfig: BetterAuthConfig = {
  secret: 'task-3-1-deterministic-server-secret-0123456789',
  baseURL: 'http://127.0.0.1:3000',
}

const createdClients: ReturnType<typeof createMongoClient>[] = []

async function removeFixture(database: Db, userId?: string) {
  const fixtureUser = userId
    ? undefined
    : await database.collection('user').findOne({ email: fixture.email })
  const id = userId ?? fixtureUser?.id

  if (id !== undefined) {
    await database.collection('session').deleteMany({ userId: id })
    await database.collection('account').deleteMany({ userId: id })
    await database.collection('user').deleteMany({ id })
  }
}

function sessionCookie(response: Response) {
  const headers = response.headers as Headers & {
    getSetCookie?: () => string[]
  }
  const setCookies = headers.getSetCookie?.() ?? [
    response.headers.get('set-cookie') ?? '',
  ]
  const cookie = setCookies.find(
    (value) =>
      value.startsWith('better-auth.session_token=') ||
      value.startsWith('__Secure-better-auth.session_token='),
  )

  if (cookie === undefined)
    throw new Error('Better Auth session cookie missing')
  return cookie.split(';', 1)[0]
}

afterEach(async () => {
  await Promise.all(createdClients.splice(0).map((client) => client.close()))
})

describe('Better Auth MongoDB integration contract', () => {
  it('validates the required server configuration without optional OAuth', () => {
    expect(() => loadBetterAuthConfig({})).toThrowError(
      BetterAuthConfigurationError,
    )
    expect(
      loadBetterAuthConfig({
        BETTER_AUTH_SECRET: fixtureConfig.secret,
        BETTER_AUTH_URL: fixtureConfig.baseURL,
      }),
    ).toEqual(fixtureConfig)

    try {
      loadBetterAuthConfig({})
    } catch (error) {
      expect(error).toBeInstanceOf(BetterAuthConfigurationError)
      expect((error as Error).message).toBe('Invalid Better Auth configuration')
      expect((error as Error).message).not.toContain(fixtureConfig.secret)
    }
  })

  it('persists a Better Auth user and session across reconnect and new instances', async () => {
    const sharedClient = createMongoClient({ environment })
    createdClients.push(sharedClient)

    const firstDatabase = await sharedClient.connect()
    await removeFixture(firstDatabase)
    const firstAuth = createBetterAuth({
      database: firstDatabase,
      config: fixtureConfig,
    })
    const signUpResponse = await firstAuth.handler(
      new Request(`${fixtureConfig.baseURL}/api/auth/sign-up/email`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(fixture),
      }),
    )
    const signUp = await signUpResponse.json()

    expect(signUpResponse.status).toBe(200)
    expect(signUp.user.email).toBe(fixture.email)
    expect(signUp.token).toEqual(expect.any(String))

    const sessionHeaders = new Headers({
      cookie: sessionCookie(signUpResponse),
    })
    const firstSession = await firstAuth.api.getSession({
      headers: sessionHeaders,
    })
    expect(firstSession?.user.id).toBe(signUp.user.id)

    await sharedClient.reconnect()
    const reconnectedAuth = createBetterAuth({
      database: await sharedClient.connect(),
      config: fixtureConfig,
    })
    const reconnectedSession = await reconnectedAuth.api.getSession({
      headers: sessionHeaders,
    })
    expect(reconnectedSession?.session.token).toBe(signUp.token)
    expect(reconnectedSession?.user.email).toBe(fixture.email)

    await sharedClient.close()
    const newClient = createMongoClient({ environment })
    createdClients.push(newClient)
    const newApplicationAuth = createBetterAuth({
      database: await newClient.connect(),
      config: fixtureConfig,
    })
    const newApplicationSession = await newApplicationAuth.api.getSession({
      headers: sessionHeaders,
    })

    expect(newApplicationSession?.session.token).toBe(signUp.token)
    expect(newApplicationSession?.user.id).toBe(signUp.user.id)

    await removeFixture(await newClient.connect(), signUp.user.id)
  })
})

describe('Better Auth server-only boundary', () => {
  it('uses the shared database boundary without index initialization', async () => {
    const client = createMongoClient({ environment })
    createdClients.push(client)
    const auth = createBetterAuth({
      database: await client.connect(),
      config: fixtureConfig,
    })

    expect(auth).toHaveProperty('api.signUpEmail')
    expect(auth).toHaveProperty('api.getSession')

    const mongoSource = await import('node:fs/promises').then((fs) =>
      fs.readFile(
        new URL(
          '../../src/server/integrations/better-auth.ts',
          import.meta.url,
        ),
        'utf8',
      ),
    )
    expect(mongoSource).not.toMatch(/createIndex|listIndexes|db:init/)
    expect(mongoSource).not.toContain('MongoClient')
  })
})
