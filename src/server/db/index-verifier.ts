import '@tanstack/react-start/server-only'

import type {
  Db,
  Document,
  IndexDescription,
  IndexDescriptionInfo,
} from 'mongodb'

import {
  INDEX_DEFINITIONS,
  type IndexDefinition,
} from '@/server/db/index-definitions'

type IndexStatus = 'created' | 'verified'

export type IndexVerification = {
  collection: string
  name: string
  status: IndexStatus
}

export class IndexDefinitionConflictError extends Error {
  readonly code = 'MONGO_INDEX_CONFLICT'

  constructor(definition: IndexDefinition) {
    super(
      `MONGO_INDEX_CONFLICT: incompatible index ${definition.collection}.${definition.name}`,
    )
    this.name = 'IndexDefinitionConflictError'
  }
}

export class IndexInitializationError extends Error {
  readonly code = 'MONGO_INDEX_INITIALIZATION_FAILED'

  constructor(collection: string) {
    super(`MONGO_INDEX_INITIALIZATION_FAILED: ${collection}`)
    this.name = 'IndexInitializationError'
  }
}

type ComparableIndex = {
  key: Record<string, number>
  unique: boolean
  sparse: boolean
  hidden: boolean
  expireAfterSeconds: number | null
  partialFilterExpression: Document | null
  collation: Document | null
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, canonicalize(nestedValue)]),
    )
  }
  return value
}

function comparableIndex(
  index: Pick<IndexDescription, 'key'> &
    Partial<
      Pick<
        IndexDescriptionInfo,
        | 'unique'
        | 'sparse'
        | 'hidden'
        | 'expireAfterSeconds'
        | 'partialFilterExpression'
        | 'collation'
      >
    >,
): ComparableIndex {
  return {
    key: Object.fromEntries(Object.entries(index.key)),
    unique: index.unique ?? false,
    sparse: index.sparse ?? false,
    hidden: index.hidden ?? false,
    expireAfterSeconds: index.expireAfterSeconds ?? null,
    partialFilterExpression:
      index.partialFilterExpression === undefined
        ? null
        : (canonicalize(index.partialFilterExpression) as Document),
    collation:
      index.collation === undefined
        ? null
        : (canonicalize(index.collation) as Document),
  }
}

function expectedIndex(definition: IndexDefinition): ComparableIndex {
  return comparableIndex({
    key: definition.key,
    unique: definition.unique,
    expireAfterSeconds: definition.expireAfterSeconds,
    partialFilterExpression: definition.partialFilterExpression,
  })
}

function sameIndex(actual: IndexDescriptionInfo, definition: IndexDefinition) {
  return (
    JSON.stringify(comparableIndex(actual)) ===
    JSON.stringify(expectedIndex(definition))
  )
}

function mongoIndex(definition: IndexDefinition): IndexDescription {
  return {
    name: definition.name,
    key: { ...definition.key },
    ...(definition.unique === undefined ? {} : { unique: definition.unique }),
    ...(definition.expireAfterSeconds === undefined
      ? {}
      : { expireAfterSeconds: definition.expireAfterSeconds }),
    ...(definition.partialFilterExpression === undefined
      ? {}
      : { partialFilterExpression: definition.partialFilterExpression }),
  }
}

async function listIndexes(database: Db, collection: string) {
  try {
    return await database.collection(collection).listIndexes().toArray()
  } catch (error) {
    if (
      error !== null &&
      typeof error === 'object' &&
      (error as { code?: number }).code === 26
    ) {
      return []
    }
    throw new IndexInitializationError(collection)
  }
}

function findExistingIndex(
  indexes: IndexDescriptionInfo[],
  definition: IndexDefinition,
) {
  const named = indexes.find((index) => index.name === definition.name)
  if (named !== undefined) return named

  const sameKey = indexes.find(
    (index) =>
      JSON.stringify(comparableIndex(index).key) ===
      JSON.stringify(expectedIndex(definition).key),
  )
  return sameKey
}

function isConflict(error: unknown) {
  if (error === null || typeof error !== 'object') return false
  const code = (error as { code?: number }).code
  return code === 85 || code === 86 || code === 11000
}

async function createMissingIndexes(
  database: Db,
  collection: string,
  definitions: IndexDefinition[],
) {
  if (definitions.length === 0) return

  try {
    await database
      .collection(collection)
      .createIndexes(definitions.map(mongoIndex))
  } catch (error) {
    if (isConflict(error)) {
      throw new IndexDefinitionConflictError(definitions[0])
    }
    throw new IndexInitializationError(collection)
  }
}

export async function verifyAndCreateIndexes(
  database: Db,
  definitions: readonly IndexDefinition[] = INDEX_DEFINITIONS,
): Promise<IndexVerification[]> {
  const definitionsByCollection = new Map<string, IndexDefinition[]>()
  for (const definition of definitions) {
    const collectionDefinitions = definitionsByCollection.get(
      definition.collection,
    )
    if (collectionDefinitions === undefined) {
      definitionsByCollection.set(definition.collection, [definition])
    } else {
      collectionDefinitions.push(definition)
    }
  }

  const verification: IndexVerification[] = []

  for (const [collection, collectionDefinitions] of definitionsByCollection) {
    const existingIndexes = await listIndexes(database, collection)
    const missingDefinitions: IndexDefinition[] = []

    for (const definition of collectionDefinitions) {
      const existing = findExistingIndex(existingIndexes, definition)
      if (existing === undefined) {
        missingDefinitions.push(definition)
        continue
      }

      if (
        existing.name !== definition.name ||
        !sameIndex(existing, definition)
      ) {
        throw new IndexDefinitionConflictError(definition)
      }

      verification.push({
        collection,
        name: definition.name,
        status: 'verified',
      })
    }

    await createMissingIndexes(database, collection, missingDefinitions)

    if (missingDefinitions.length === 0) continue

    const finalIndexes = await listIndexes(database, collection)
    for (const definition of missingDefinitions) {
      const existing = finalIndexes.find(
        (index) => index.name === definition.name,
      )
      if (existing === undefined || !sameIndex(existing, definition)) {
        throw new IndexDefinitionConflictError(definition)
      }

      verification.push({
        collection,
        name: definition.name,
        status: 'created',
      })
    }
  }

  return verification
}
