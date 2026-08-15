import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  EnvironmentValidationError,
  loadServerEnv,
} from '../../src/server/env.server'

const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

describe('server environment contract', () => {
  it('uses a local MongoDB connection by default', () => {
    expect(loadServerEnv({})).toEqual({
      mode: 'local',
      mongoUri: 'mongodb://127.0.0.1:27017',
      databaseName: 'pokedex',
    })
  })

  it('requires explicit Atlas opt-in, a mongodb+srv URI and credentials', () => {
    const secret = 'atlas-password-must-not-leak'

    expect(() =>
      loadServerEnv({
        MONGO_MODE: 'atlas',
        MONGO_ATLAS_URI: 'https://not-mongodb.example',
        MONGO_ATLAS_USERNAME: 'trainer',
        MONGO_ATLAS_PASSWORD: secret,
      }),
    ).toThrowError(EnvironmentValidationError)

    expect(() =>
      loadServerEnv({
        MONGO_MODE: 'atlas',
        MONGO_ATLAS_URI: 'mongodb+srv://cluster.example.mongodb.net/pokedex',
        MONGO_ATLAS_USERNAME: 'trainer',
      }),
    ).toThrowError(EnvironmentValidationError)

    expect(() =>
      loadServerEnv({
        MONGO_URI: 'mongodb+srv://cluster.example.mongodb.net/pokedex',
      }),
    ).toThrowError(EnvironmentValidationError)

    try {
      loadServerEnv({
        MONGO_MODE: 'atlas',
        MONGO_ATLAS_URI: 'https://not-mongodb.example',
        MONGO_ATLAS_USERNAME: 'trainer',
        MONGO_ATLAS_PASSWORD: secret,
      })
    } catch (error) {
      expect(error).toBeInstanceOf(EnvironmentValidationError)
      expect((error as Error).message).not.toContain(secret)
      expect((error as Error).message).not.toContain('not-mongodb.example')
    }
  })

  it('parses Atlas credentials without boolean coercion surprises', () => {
    expect(() =>
      loadServerEnv({
        MONGO_MODE: 'false',
        MONGO_ATLAS_URI: 'mongodb+srv://cluster.example.mongodb.net/pokedex',
        MONGO_ATLAS_USERNAME: 'trainer',
        MONGO_ATLAS_PASSWORD: 'secret',
      }),
    ).toThrowError(EnvironmentValidationError)

    expect(() =>
      loadServerEnv({
        MONGO_MODE: 'atlas',
        MONGO_ATLAS_OPT_IN: 'false',
        MONGO_ATLAS_URI: 'mongodb+srv://cluster.example.mongodb.net/pokedex',
        MONGO_ATLAS_USERNAME: 'trainer',
        MONGO_ATLAS_PASSWORD: 'secret',
      }),
    ).toThrowError(EnvironmentValidationError)

    const environment = loadServerEnv({
      MONGO_MODE: 'atlas',
      MONGO_ATLAS_OPT_IN: 'true',
      MONGO_ATLAS_URI: 'mongodb+srv://cluster.example.mongodb.net/pokedex',
      MONGO_ATLAS_USERNAME: 'trainer',
      MONGO_ATLAS_PASSWORD: 'secret with spaces',
      MONGO_DB_NAME: 'pokedex-atlas',
    })

    expect(environment.mode).toBe('atlas')
    expect(environment.databaseName).toBe('pokedex-atlas')
    expect(environment.mongoUri).toMatch(
      /^mongodb\+srv:\/\/trainer:[^@]+@cluster\.example\.mongodb\.net\//,
    )

    expect(() =>
      loadServerEnv({
        MONGO_MODE: 'atlas',
        MONGO_ATLAS_URI: 'mongodb+srv://cluster.example.mongodb.net/pokedex',
        MONGO_ATLAS_USERNAME: 'trainer',
        MONGO_ATLAS_PASSWORD: 'secret',
      }),
    ).toThrowError(EnvironmentValidationError)
  })

  it('enforces the server-only boundary and keeps client modules free of secrets', () => {
    const environmentSource = readFileSync(
      resolve(projectRoot, 'src/server/env.server.ts'),
      'utf8',
    )

    expect(environmentSource).toContain(
      "import '@tanstack/react-start/server-only'",
    )
    expect(
      readFileSync(resolve(projectRoot, 'vite.config.ts'), 'utf8'),
    ).toMatch(
      /importProtection:\s*\{[^}]*enabled:\s*true[^}]*behavior:\s*'error'/s,
    )

    for (const clientModule of [
      'src/routes/index.tsx',
      'src/routes/__root.tsx',
      'src/router.tsx',
    ]) {
      const source = readFileSync(resolve(projectRoot, clientModule), 'utf8')
      expect(source).not.toMatch(/env\.server|server-only|mongodb|MONGO_/i)
    }
  })
})
