import '@tanstack/react-start/server-only'

import type { Db, WithId } from 'mongodb'
import { z } from 'zod'

import type { PokemonRecord } from '@/server/catalog'
import { getCatalogService } from '@/server/catalog'
import { getMongoClient } from '@/server/db/mongo-client'

const tagSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} _-]*$/u)

export const addCollectionSchema = z.object({
  pokemonId: z.number().int().min(1).max(1025),
  quantity: z.number().int().min(1).max(99).default(1),
})
export const updateCollectionSchema = z
  .object({
    quantity: z.number().int().min(1).max(999).optional(),
    nickname: z.string().trim().max(40).nullable().optional(),
    notes: z.string().trim().max(500).optional(),
    tags: z.array(tagSchema).max(8).optional(),
    favorite: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0)

export type CollectionEntry = {
  userId: string
  pokemonId: number
  pokemon: Pick<PokemonRecord, 'name' | 'sprite' | 'types' | 'generation'>
  quantity: number
  nickname: string | null
  notes: string
  tags: string[]
  favorite: boolean
  createdAt: Date
  updatedAt: Date
}

export type DashboardStats = {
  totalUnique: number
  totalQuantity: number
  favorites: number
  typeDistribution: Array<{ type: string; count: number }>
  recent: CollectionEntry[]
}

export function calculateDashboardStats(
  entries: CollectionEntry[],
): DashboardStats {
  const types = new Map<string, number>()
  for (const entry of entries) {
    for (const type of entry.pokemon.types) {
      types.set(type, (types.get(type) ?? 0) + entry.quantity)
    }
  }
  return {
    totalUnique: entries.length,
    totalQuantity: entries.reduce((sum, entry) => sum + entry.quantity, 0),
    favorites: entries.filter((entry) => entry.favorite).length,
    typeDistribution: [...types]
      .map(([type, count]) => ({ type, count }))
      .sort(
        (left, right) =>
          right.count - left.count || left.type.localeCompare(right.type),
      ),
    recent: [...entries]
      .sort(
        (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime(),
      )
      .slice(0, 5),
  }
}

function cleanEntry(entry: WithId<CollectionEntry>): CollectionEntry {
  const { _id: _ignored, ...value } = entry
  return value
}

export function createCollectionService(database: Db) {
  const entries = database.collection<CollectionEntry>('collection_entries')

  async function list(userId: string) {
    const rows = await entries
      .find({ userId })
      .sort({ updatedAt: -1 })
      .toArray()
    return rows.map(cleanEntry)
  }

  async function add(userId: string, pokemon: PokemonRecord, input: unknown) {
    const parsed = addCollectionSchema.parse(input)
    const timestamp = new Date()
    const snapshot = {
      name: pokemon.name,
      sprite: pokemon.sprite,
      types: pokemon.types,
      generation: pokemon.generation,
    }
    const incrementExisting = () =>
      entries.updateOne(
        {
          userId,
          pokemonId: parsed.pokemonId,
          quantity: { $lte: 999 - parsed.quantity },
        },
        {
          $inc: { quantity: parsed.quantity },
          $set: { pokemon: snapshot, updatedAt: timestamp },
        },
      )

    const incremented = await incrementExisting()
    if (incremented.matchedCount === 0) {
      try {
        await entries.insertOne({
          userId,
          pokemonId: parsed.pokemonId,
          pokemon: snapshot,
          quantity: parsed.quantity,
          nickname: null,
          notes: '',
          tags: [],
          favorite: false,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
      } catch (error) {
        if (
          !(error instanceof Error && 'code' in error && error.code === 11000)
        ) {
          throw error
        }
        const retry = await incrementExisting()
        if (retry.matchedCount === 0) {
          const quantityError = new Error(
            'La cantidad total no puede superar 999.',
          )
          Object.assign(quantityError, { status: 400 })
          throw quantityError
        }
      }
    }
    const entry = await entries.findOne({ userId, pokemonId: parsed.pokemonId })
    if (entry === null) throw new Error('Collection write failed')
    return cleanEntry(entry)
  }

  async function update(userId: string, pokemonId: number, input: unknown) {
    const parsed = updateCollectionSchema.parse(input)
    const updateFields = { ...parsed, updatedAt: new Date() }
    const result = await entries.findOneAndUpdate(
      { userId, pokemonId },
      { $set: updateFields },
      { returnDocument: 'after' },
    )
    if (result === null) {
      const error = new Error('Entrada no encontrada.')
      Object.assign(error, { status: 404 })
      throw error
    }
    return cleanEntry(result)
  }

  async function remove(userId: string, pokemonId: number) {
    const result = await entries.deleteOne({ userId, pokemonId })
    if (result.deletedCount === 0) {
      const error = new Error('Entrada no encontrada.')
      Object.assign(error, { status: 404 })
      throw error
    }
  }

  async function stats(userId: string) {
    return calculateDashboardStats(await list(userId))
  }

  return { add, list, remove, stats, update }
}

export async function getCollectionService() {
  return createCollectionService(await getMongoClient().connect())
}

export async function addPokemonToCollection(userId: string, input: unknown) {
  const parsed = addCollectionSchema.parse(input)
  const pokemon = await (await getCatalogService()).getPokemon(parsed.pokemonId)
  return (await getCollectionService()).add(userId, pokemon, parsed)
}
