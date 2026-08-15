const baseUrl = (process.env.APP_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
)

async function expectJson(path, validate) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`${path} returned HTTP ${response.status}`)
  const body = await response.json()
  if (!validate(body)) throw new Error(`${path} returned an invalid payload`)
}

await expectJson('/api/health', (body) => body?.status === 'healthy')
await expectJson(
  '/api/catalog?page=1&limit=5',
  (body) => Array.isArray(body?.items) && body.items.length > 0,
)

console.log(JSON.stringify({ status: 'ready', baseUrl }))
