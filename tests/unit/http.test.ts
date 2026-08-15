import { describe, expect, it } from 'vitest'

import {
  apiError,
  assertTrustedMutation,
  readJsonBody,
} from '../../src/server/http'

describe('HTTP request boundary', () => {
  it('rejects cross-site mutations', () => {
    const request = new Request('https://app.example/api/collection', {
      method: 'POST',
      headers: { Origin: 'https://attacker.example' },
    })

    expect(() => assertTrustedMutation(request)).toThrow(
      'Origen de solicitud no permitido.',
    )
  })

  it('accepts same-origin mutations and non-browser clients without Origin', () => {
    expect(() =>
      assertTrustedMutation(
        new Request('https://app.example/api/collection', {
          method: 'POST',
          headers: { Origin: 'https://app.example' },
        }),
      ),
    ).not.toThrow()
    expect(() =>
      assertTrustedMutation(
        new Request('https://app.example/api/collection', { method: 'POST' }),
      ),
    ).not.toThrow()
  })

  it('limits streamed JSON bodies without trusting Content-Length', async () => {
    const request = new Request('https://app.example/api/collection', {
      method: 'POST',
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{"value":"large"}'))
          controller.close()
        },
      }),
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    let caught: unknown
    try {
      await readJsonBody(request, 5)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(Error)
    expect(apiError(caught).status).toBe(413)
  })
})
