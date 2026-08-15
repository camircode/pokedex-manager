import type { Db } from 'mongodb'
import { afterEach, describe, expect, it } from 'vitest'

import { getAuth, resetAuthForTests } from '../../src/server/auth'
import {
  type MongoClientPort,
  setMongoClientForTests,
} from '../../src/server/db/mongo-client'

afterEach(() => {
  resetAuthForTests()
  setMongoClientForTests(undefined)
})

describe('authentication initialization', () => {
  it('retries after a transient database failure', async () => {
    process.env.BETTER_AUTH_SECRET =
      'auth-recovery-test-secret-at-least-32-characters'
    process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3000'
    let attempts = 0
    const client: MongoClientPort = {
      async connect() {
        attempts += 1
        if (attempts === 1) throw new Error('temporary outage')
        return {} as Db
      },
      async reconnect() {
        return {} as Db
      },
      async health() {
        return { status: 'healthy' }
      },
      async close() {},
    }
    setMongoClientForTests(client)

    await expect(getAuth()).rejects.toThrow('temporary outage')
    await expect(getAuth()).resolves.toHaveProperty('api.getSession')
    expect(attempts).toBe(2)
  })
})
