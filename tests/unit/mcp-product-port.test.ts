import { beforeEach, describe, expect, it, vi } from 'vitest'

const dependencies = vi.hoisted(() => ({
  getCatalogService: vi.fn(),
  getCollectionService: vi.fn(),
}))

vi.mock('@/server/catalog', () => ({
  getCatalogService: dependencies.getCatalogService,
}))

vi.mock('@/server/collection', () => ({
  getCollectionService: dependencies.getCollectionService,
}))

vi.mock('@/server/research', () => ({
  getCurrentResearch: vi.fn(),
}))

import { productReadonlyPort } from '../../src/server/integrations/mcp/product-port'

describe('MCP product port', () => {
  beforeEach(() => {
    dependencies.getCatalogService.mockReset()
    dependencies.getCollectionService.mockReset()
    dependencies.getCollectionService.mockResolvedValue({})
  })

  it('honors search limits below the catalog page minimum', async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      pokemonId: index + 1,
    }))
    const list = vi.fn().mockResolvedValue({
      items,
      page: 1,
      pages: 10,
      total: 50,
    })
    dependencies.getCatalogService.mockResolvedValue({ list })

    const result = await productReadonlyPort.list({
      principal: { subject: 'assistant-user' },
      operation: 'search_pokemon',
      input: { query: 'pikachu', limit: 1 },
    })

    expect(list).toHaveBeenCalledWith({
      query: 'pikachu',
      limit: 5,
      page: 1,
    })
    expect(result.data).toMatchObject({
      items: [{ pokemonId: 1 }],
      total: 50,
    })
  })
})
