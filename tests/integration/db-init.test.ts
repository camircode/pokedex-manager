import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type Db, MongoClient } from 'mongodb'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { healthHandler } from '../../src/routes/api/health'
import { PHASE_ZERO_INDEX_DEFINITIONS } from '../../src/server/db/index-definitions'
import {
  createMongoClient,
  type MongoDriverClient,
} from '../../src/server/db/mongo-client'
import { loadServerEnv } from '../../src/server/env.server'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const mongoUri =
  process.env.MONGO_TEST_URI ??
  'mongodb://127.0.0.1:27017/?serverSelectionTimeoutMS=1500'
const testDatabaseName =
  process.env.MONGO_TEST_DB_NAME ??
  `pokedex_task_2_2_${process.pid}_${Date.now()}`
const testEnvironment = {
  ...process.env,
  MONGO_MODE: 'local',
  MONGO_URI: mongoUri,
  MONGO_DB_NAME: testDatabaseName,
}

type CommandResult = {
  status: number
  stdout: string
  stderr: string
}

function runDbInit(databaseName: string): Promise<CommandResult> {
  return new Promise((resolveResult, reject) => {
    const child = spawn('pnpm', ['db:init'], {
      cwd: projectRoot,
      env: { ...testEnvironment, MONGO_DB_NAME: databaseName },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.once('error', reject)
    child.once('close', (status, signal) => {
      resolveResult({
        status: status ?? (signal === null ? 1 : 1),
        stdout,
        stderr,
      })
    })
  })
}

function expectedIndexes() {
  return PHASE_ZERO_INDEX_DEFINITIONS.map((definition) => ({
    collection: definition.collection,
    name: definition.name,
    key: definition.key,
    ...(definition.unique === undefined ? {} : { unique: definition.unique }),
    ...(definition.expireAfterSeconds === undefined
      ? {}
      : { expireAfterSeconds: definition.expireAfterSeconds }),
    ...(definition.partialFilterExpression === undefined
      ? {}
      : { partialFilterExpression: definition.partialFilterExpression }),
  }))
}

async function actualIndexes(database: Db) {
  const expected = expectedIndexes()
  const collections = [...new Set(expected.map((index) => index.collection))]
  const indexes = []

  for (const collectionName of collections) {
    const collectionIndexes = await database
      .collection(collectionName)
      .listIndexes()
      .toArray()

    for (const index of collectionIndexes) {
      if (index.name === '_id_') continue
      indexes.push({
        collection: collectionName,
        name: index.name,
        key: index.key,
        ...(index.unique === undefined ? {} : { unique: index.unique }),
        ...(index.expireAfterSeconds === undefined
          ? {}
          : { expireAfterSeconds: index.expireAfterSeconds }),
        ...(index.partialFilterExpression === undefined
          ? {}
          : { partialFilterExpression: index.partialFilterExpression }),
      })
    }
  }

  return indexes.sort((left, right) =>
    `${left.collection}:${left.name}`.localeCompare(
      `${right.collection}:${right.name}`,
    ),
  )
}

function createRuntimeFake() {
  const calls = {
    createIndex: 0,
    createIndexes: 0,
    listIndexes: 0,
  }
  const database = {
    admin: () => ({ ping: vi.fn(async () => ({ ok: 1 })) }),
  } as unknown as Db
  const driver: MongoDriverClient = {
    connect: vi.fn(async () => undefined),
    db: vi.fn(() => database),
    close: vi.fn(async () => undefined),
  }

  return { calls, database, driver }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('explicit MongoDB index initialization', () => {
  it('creates the complete named set twice without losing data or changing identity', async () => {
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 2_000,
      serverSelectionTimeoutMS: 2_000,
    })
    const marker = `sentinel-${Date.now()}`

    try {
      await client.connect()
      const database = client.db(testDatabaseName)
      await database.collection('db_init_sentinels').insertOne({
        marker,
        createdAt: new Date(),
      })

      const first = await runDbInit(testDatabaseName)
      expect(first.status, first.stderr || first.stdout).toBe(0)
      expect(first.stdout).not.toContain(mongoUri)
      expect(first.stderr).not.toContain(mongoUri)

      const firstIndexes = await actualIndexes(database)
      expect(firstIndexes).toEqual(
        expectedIndexes().sort((left, right) =>
          `${left.collection}:${left.name}`.localeCompare(
            `${right.collection}:${right.name}`,
          ),
        ),
      )
      expect(
        await database.collection('db_init_sentinels').countDocuments({
          marker,
        }),
      ).toBe(1)

      const second = await runDbInit(testDatabaseName)
      expect(second.status, second.stderr || second.stdout).toBe(0)

      expect(await actualIndexes(database)).toEqual(firstIndexes)
      expect(
        await database.collection('db_init_sentinels').countDocuments({
          marker,
        }),
      ).toBe(1)
      expect(second.stdout).not.toContain(mongoUri)
      expect(second.stderr).not.toContain(mongoUri)
    } finally {
      await client.close()
    }
  }, 30_000)

  it('reports incompatible existing definitions without hiding the conflict', async () => {
    const definition = PHASE_ZERO_INDEX_DEFINITIONS.find(
      (candidate) =>
        candidate.collection === 'pokemon_cache' &&
        candidate.name.endsWith('pokemon_id_unique'),
    )
    expect(definition).toBeDefined()

    const conflictDatabaseName = `${testDatabaseName}_conflict`
    const client = new MongoClient(mongoUri, {
      connectTimeoutMS: 2_000,
      serverSelectionTimeoutMS: 2_000,
    })

    try {
      await client.connect()
      await client
        .db(conflictDatabaseName)
        .collection('pokemon_cache')
        .createIndex(
          { incompatible: 1 },
          { name: definition?.name ?? 'pokemon_cache_pokemon_id_unique' },
        )

      const result = await runDbInit(conflictDatabaseName)
      const output = `${result.stdout}\n${result.stderr}`

      expect(result.status).not.toBe(0)
      expect(output).toContain('MONGO_INDEX_CONFLICT')
      expect(output).not.toContain(mongoUri)
    } finally {
      await client.close()
    }
  }, 30_000)

  it('keeps index creation outside request, health, and reconnect paths', async () => {
    const runtimeFake = createRuntimeFake()
    const client = createMongoClient({
      environment: loadServerEnv({
        MONGO_MODE: 'local',
        MONGO_URI: mongoUri,
        MONGO_DB_NAME: testDatabaseName,
      }),
      clientFactory: () => runtimeFake.driver,
    })

    await client.connect()
    await client.health()
    await client.reconnect()
    await healthHandler(client)
    await client.close()

    expect(runtimeFake.calls).toEqual({
      createIndex: 0,
      createIndexes: 0,
      listIndexes: 0,
    })

    const sourceFiles = [
      'src/server/db/mongo-client.ts',
      'src/routes/api/health.ts',
      'scripts/db-init.ts',
      'src/server/db/index-verifier.ts',
    ]
    for (const file of sourceFiles) {
      const source = await readFile(resolve(projectRoot, file), 'utf8')
      expect(source).not.toMatch(
        /\b(drop|dropDatabase|dropIndex|syncIndexes)\b/i,
      )
    }

    for (const file of sourceFiles.slice(0, 2)) {
      const source = await readFile(resolve(projectRoot, file), 'utf8')
      expect(source).not.toMatch(
        /createIndexes?|listIndexes|index-definitions|index-verifier|db:init/,
      )
    }
  })
})
