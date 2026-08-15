import '@tanstack/react-start/server-only'

import { z } from 'zod'

const DEFAULT_LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017'
const DEFAULT_DATABASE_NAME = 'pokedex'

const nonEmptyString = z.string().trim().min(1)
const strictBooleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')

const rawServerEnvironmentSchema = z.object({
  MONGO_MODE: z.enum(['local', 'atlas']).default('local'),
  MONGO_URI: nonEmptyString.optional(),
  MONGO_DB_NAME: nonEmptyString.default(DEFAULT_DATABASE_NAME),
  MONGO_ATLAS_URI: nonEmptyString.optional(),
  MONGO_ATLAS_USERNAME: nonEmptyString.optional(),
  MONGO_ATLAS_PASSWORD: z.string().min(1).optional(),
  MONGO_ATLAS_OPT_IN: strictBooleanString,
})

export type ServerEnvironment = {
  mode: 'local' | 'atlas'
  mongoUri: string
  databaseName: string
}

export class EnvironmentValidationError extends Error {
  readonly code = 'INVALID_SERVER_ENVIRONMENT'

  constructor() {
    super('Invalid server environment configuration')
    this.name = 'EnvironmentValidationError'
  }
}

function hasMongoScheme(value: string, scheme: 'mongodb:' | 'mongodb+srv:') {
  try {
    const parsed = new URL(value)
    return parsed.protocol === scheme && parsed.hostname.length > 0
  } catch {
    return false
  }
}

function createAtlasUri(
  uri: string | undefined,
  username: string | undefined,
  password: string | undefined,
) {
  if (
    uri === undefined ||
    username === undefined ||
    password === undefined ||
    !hasMongoScheme(uri, 'mongodb+srv:')
  ) {
    throw new EnvironmentValidationError()
  }

  try {
    const parsed = new URL(uri)
    parsed.username = username
    parsed.password = password
    return parsed.toString()
  } catch {
    throw new EnvironmentValidationError()
  }
}

function safeParseServerEnvironment(input: NodeJS.ProcessEnv) {
  const parsed = rawServerEnvironmentSchema.safeParse(input)
  if (!parsed.success) throw new EnvironmentValidationError()
  return parsed.data
}

export function loadServerEnv(input: NodeJS.ProcessEnv = process.env) {
  const raw = safeParseServerEnvironment(input)
  const atlasRequested = raw.MONGO_MODE === 'atlas'

  if (atlasRequested && !raw.MONGO_ATLAS_OPT_IN) {
    throw new EnvironmentValidationError()
  }

  if (atlasRequested) {
    return {
      mode: 'atlas' as const,
      mongoUri: createAtlasUri(
        raw.MONGO_ATLAS_URI,
        raw.MONGO_ATLAS_USERNAME,
        raw.MONGO_ATLAS_PASSWORD,
      ),
      databaseName: raw.MONGO_DB_NAME,
    } satisfies ServerEnvironment
  }

  const mongoUri = raw.MONGO_URI ?? DEFAULT_LOCAL_MONGO_URI
  if (!hasMongoScheme(mongoUri, 'mongodb:')) {
    throw new EnvironmentValidationError()
  }

  return {
    mode: 'local' as const,
    mongoUri,
    databaseName: raw.MONGO_DB_NAME,
  } satisfies ServerEnvironment
}

export function getServerEnv() {
  return loadServerEnv()
}
