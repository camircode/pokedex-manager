import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))

describe('compose runtime contract', () => {
  it('orders healthy Mongo, index init, app server and persistent volume', () => {
    const compose = readFileSync(resolve(root, 'docker-compose.yml'), 'utf8')
    const dockerfile = readFileSync(resolve(root, 'Dockerfile'), 'utf8')
    expect(compose).toMatch(/mongo:[\s\S]*healthcheck:/)
    expect(compose).toMatch(/app:[\s\S]*condition: service_healthy/)
    expect(compose).toContain('MONGO_URI: mongodb://mongo:27017')
    expect(compose).toContain("'127.0.0.1:27017:27017'")
    expect(compose).toContain("'127.0.0.1:3000:3000'")
    expect(compose).toContain("fetch('http://127.0.0.1:3000/api/health')")
    expect(compose).toContain('pokedex-mongo-data:/data/db')
    expect(dockerfile).toMatch(
      /FROM node:22-bookworm-slim@sha256:[a-f0-9]{64} AS dependencies/,
    )
    expect(dockerfile).toMatch(
      /FROM node:22-bookworm-slim@sha256:[a-f0-9]{64} AS runtime/,
    )
    expect(dockerfile).toContain('USER node')
    expect(dockerfile).toContain('scripts/db-init.ts')
    expect(dockerfile).toContain('exec node .output/server/index.mjs')
  })

  it('defines a production service with external Atlas and required secrets', () => {
    const compose = readFileSync(
      resolve(root, 'compose.production.yml'),
      'utf8',
    )
    expect(compose).not.toMatch(/^\s{2}mongo:/m)
    expect(compose).toContain("'127.0.0.1:3000:3000'")
    expect(compose).toContain(`image: \${APP_IMAGE:-pokedex-manager:local}`)
    expect(compose).toContain('MONGO_MODE: atlas')
    expect(compose).toContain("MONGO_ATLAS_OPT_IN: 'true'")
    expect(compose).toMatch(/BETTER_AUTH_SECRET: \$\{BETTER_AUTH_SECRET:\?/)
    expect(compose).toMatch(/BETTER_AUTH_URL: \$\{BETTER_AUTH_URL:\?/)
  })
})
