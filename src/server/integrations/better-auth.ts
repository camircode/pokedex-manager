import '@tanstack/react-start/server-only'

import { mongodbAdapter } from '@better-auth/mongo-adapter'
import { betterAuth } from 'better-auth'
import type { Db } from 'mongodb'
import { z } from 'zod'

const nonEmptyString = z.string().trim().min(1)

const betterAuthEnvironmentSchema = z.object({
  BETTER_AUTH_SECRET: nonEmptyString.min(32),
  BETTER_AUTH_URL: z.string().url().default('http://127.0.0.1:3000'),
})

const betterAuthConfigSchema = z.object({
  secret: nonEmptyString.min(32),
  baseURL: z.string().url(),
})

export type BetterAuthConfig = {
  secret: string
  baseURL: string
}

export class BetterAuthConfigurationError extends Error {
  readonly code = 'INVALID_BETTER_AUTH_CONFIGURATION'

  constructor() {
    super('Invalid Better Auth configuration')
    this.name = 'BetterAuthConfigurationError'
  }
}

function parseBetterAuthConfig(input: unknown): BetterAuthConfig {
  const parsed = betterAuthConfigSchema.safeParse(input)
  if (!parsed.success) throw new BetterAuthConfigurationError()
  return parsed.data
}

export function loadBetterAuthConfig(
  input: NodeJS.ProcessEnv = process.env,
): BetterAuthConfig {
  const parsed = betterAuthEnvironmentSchema.safeParse(input)
  if (!parsed.success) throw new BetterAuthConfigurationError()

  return {
    secret: parsed.data.BETTER_AUTH_SECRET,
    baseURL: parsed.data.BETTER_AUTH_URL,
  }
}

type BetterAuthFactoryOptions = {
  database: Db
  config?: BetterAuthConfig
}

export function createBetterAuth(options: BetterAuthFactoryOptions) {
  const config = parseBetterAuthConfig(options.config ?? loadBetterAuthConfig())

  return betterAuth({
    baseURL: config.baseURL,
    secret: config.secret,
    database: mongodbAdapter(options.database),
    emailAndPassword: { enabled: true },
  })
}
