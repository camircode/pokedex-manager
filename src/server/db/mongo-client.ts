import '@tanstack/react-start/server-only'

import { type Db, MongoClient } from 'mongodb'

import { getServerEnv, type ServerEnvironment } from '@/server/env.server'

export type MongoHealth = {
  status: 'healthy' | 'unhealthy'
}

export interface MongoClientPort {
  connect(): Promise<Db>
  reconnect(): Promise<Db>
  health(): Promise<MongoHealth>
  close(): Promise<void>
}

export interface MongoDriverClient {
  connect(): Promise<unknown>
  db(name: string): Db
  close(): Promise<void>
}

export type MongoClientFactory = (uri: string) => MongoDriverClient

export class MongoConnectionError extends Error {
  readonly code = 'MONGO_CONNECTION_FAILED'

  constructor() {
    super('MongoDB connection failed')
    this.name = 'MongoConnectionError'
  }
}

type MongoClientOptions = {
  environment?: ServerEnvironment
  clientFactory?: MongoClientFactory
}

type Connection = {
  client: MongoDriverClient
  database: Db
}

const defaultClientFactory: MongoClientFactory = (uri) =>
  new MongoClient(uri, {
    connectTimeoutMS: 2_000,
    serverSelectionTimeoutMS: 2_000,
  })

export class SharedMongoClient implements MongoClientPort {
  private connection: Connection | undefined
  private pendingConnection: Promise<Db> | undefined

  private readonly environment: ServerEnvironment
  private readonly clientFactory: MongoClientFactory

  constructor(options: MongoClientOptions = {}) {
    this.environment = options.environment ?? getServerEnv()
    this.clientFactory = options.clientFactory ?? defaultClientFactory
  }

  async connect() {
    if (this.connection !== undefined) return this.connection.database
    if (this.pendingConnection !== undefined) return this.pendingConnection

    const pendingConnection = this.openConnection()
    this.pendingConnection = pendingConnection

    try {
      return await pendingConnection
    } finally {
      if (this.pendingConnection === pendingConnection) {
        this.pendingConnection = undefined
      }
    }
  }

  async reconnect() {
    await this.close()
    return this.connect()
  }

  async health(): Promise<MongoHealth> {
    try {
      const database = await this.connect()
      await database.admin().ping({ timeoutMS: 1_500 })
      return { status: 'healthy' }
    } catch {
      return { status: 'unhealthy' }
    }
  }

  async close() {
    const pendingConnection = this.pendingConnection
    if (pendingConnection !== undefined) {
      await pendingConnection.catch(() => undefined)
    }

    const connection = this.connection
    this.connection = undefined

    if (connection !== undefined) await connection.client.close()
  }

  private async openConnection() {
    const client = this.clientFactory(this.environment.mongoUri)

    try {
      await client.connect()
      const database = client.db(this.environment.databaseName)
      this.connection = { client, database }
      return database
    } catch {
      await client.close().catch(() => undefined)
      throw new MongoConnectionError()
    }
  }
}

export function createMongoClient(options: MongoClientOptions = {}) {
  return new SharedMongoClient(options)
}

let sharedClient: MongoClientPort | undefined

export function getMongoClient() {
  if (sharedClient === undefined) sharedClient = createMongoClient()
  return sharedClient
}

export function setMongoClientForTests(client: MongoClientPort | undefined) {
  sharedClient = client
}

export async function closeSharedMongoClient() {
  const client = sharedClient
  sharedClient = undefined
  if (client !== undefined) await client.close()
}
