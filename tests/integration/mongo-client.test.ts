import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Db } from 'mongodb'
import { describe, expect, it, vi } from 'vitest'

import { healthHandler } from '../../src/routes/api/health'
import {
  createMongoClient,
  type MongoClientPort,
  type MongoDriverClient,
} from '../../src/server/db/mongo-client'
import { loadServerEnv } from '../../src/server/env.server'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const testDatabaseName = `pokedex_task_2_1_${process.pid}`
const localEnvironment = loadServerEnv({
  MONGO_MODE: 'local',
  MONGO_URI:
    process.env.MONGO_TEST_URI ??
    'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=1500',
  MONGO_DB_NAME: process.env.MONGO_TEST_DB_NAME ?? testDatabaseName,
})

type FakeState = {
  connectCalls: number
  closeCalls: number
  pingCalls: number
  indexCalls: number
}

function createFakeDriver(options: { pingFails?: boolean } = {}) {
  const state: FakeState = {
    connectCalls: 0,
    closeCalls: 0,
    pingCalls: 0,
    indexCalls: 0,
  }

  const database = {
    admin: () => ({
      ping: async () => {
        state.pingCalls += 1
        if (options.pingFails) throw new Error('database unavailable')
        return { ok: 1 }
      },
    }),
    collection: () => ({
      createIndex: async () => {
        state.indexCalls += 1
        return 'unexpected-index'
      },
    }),
  } as unknown as Db

  const driver: MongoDriverClient = {
    connect: vi.fn(async () => {
      state.connectCalls += 1
    }),
    db: vi.fn(() => database),
    close: vi.fn(async () => {
      state.closeCalls += 1
    }),
  }

  return { database, driver, state }
}

describe('shared MongoDB client contract', () => {
  it('shares one connection, reconnects explicitly, and never initializes indexes', async () => {
    const fake = createFakeDriver()
    const client = createMongoClient({
      environment: localEnvironment,
      clientFactory: () => fake.driver,
    })

    await expect(client.connect()).resolves.toBe(fake.database)
    await expect(client.connect()).resolves.toBe(fake.database)
    await expect(client.health()).resolves.toEqual({ status: 'healthy' })
    await expect(client.reconnect()).resolves.toBe(fake.database)
    await expect(client.health()).resolves.toEqual({ status: 'healthy' })

    expect(fake.state.connectCalls).toBe(2)
    expect(fake.state.closeCalls).toBe(1)
    expect(fake.state.pingCalls).toBe(2)
    expect(fake.state.indexCalls).toBe(0)

    await client.close()
    expect(fake.state.closeCalls).toBe(2)
  })

  it('returns controlled health responses with HTTP 200/503 and no secrets', async () => {
    const healthyClient = createMongoClient({
      environment: localEnvironment,
      clientFactory: () => createFakeDriver().driver,
    })
    const unhealthyFake = createFakeDriver({ pingFails: true })
    const unhealthyClient = createMongoClient({
      environment: localEnvironment,
      clientFactory: () => unhealthyFake.driver,
    })

    const healthyResponse = await healthHandler(healthyClient)
    const unhealthyResponse = await healthHandler(unhealthyClient)
    const unhealthyBody = await unhealthyResponse.text()
    const secret = 'health-error-secret'
    const leakingClient = {
      health: vi.fn(async () => {
        throw new Error(secret)
      }),
    } as unknown as MongoClientPort
    const errorResponse = await healthHandler(leakingClient)
    const errorBody = await errorResponse.text()

    expect(healthyResponse.status).toBe(200)
    await expect(healthyResponse.json()).resolves.toEqual({ status: 'healthy' })
    expect(unhealthyResponse.status).toBe(503)
    expect(unhealthyBody).toBe('{"status":"unhealthy"}')
    expect(unhealthyBody).not.toContain('mongodb://')
    expect(unhealthyBody).not.toContain('MONGO_')
    expect(errorResponse.status).toBe(503)
    expect(errorBody).toBe('{"status":"unhealthy"}')
    expect(errorBody).not.toContain(secret)

    await healthyClient.close()
    await unhealthyClient.close()
  })

  it('does not call index initialization from client, health, or reconnect code', () => {
    const files = ['src/server/db/mongo-client.ts', 'src/routes/api/health.ts']

    for (const file of files) {
      const source = readFileSync(resolve(projectRoot, file), 'utf8')
      expect(source).not.toMatch(/createIndex|listIndexes|db:init/)
    }
  })

  it('persists a document across a real MongoDB reconnect', async () => {
    const client = createMongoClient({ environment: localEnvironment })
    const collectionName = `reconnect_${Date.now()}`
    const marker = `task-2-1-${Date.now()}`

    try {
      const database = await client.connect()
      await database.collection(collectionName).insertOne({ marker })
      await expect(client.health()).resolves.toEqual({ status: 'healthy' })

      await client.reconnect()

      const persisted = await client
        .connect()
        .then((reconnectedDatabase) =>
          reconnectedDatabase.collection(collectionName).findOne({ marker }),
        )

      expect(persisted).toMatchObject({ marker })
      await client
        .connect()
        .then((reconnectedDatabase) =>
          reconnectedDatabase.collection(collectionName).deleteOne({ marker }),
        )
    } finally {
      await client.close()
    }
  })
})
