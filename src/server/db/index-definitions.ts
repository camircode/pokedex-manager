import '@tanstack/react-start/server-only'

import type { Document, IndexDescription } from 'mongodb'

export type IndexKey = Readonly<Record<string, 1 | -1>>

export type IndexDefinition = Readonly<{
  collection: string
  name: string
  key: IndexKey
  unique?: IndexDescription['unique']
  expireAfterSeconds?: IndexDescription['expireAfterSeconds']
  partialFilterExpression?: Document
}>

const definitions = [
  {
    collection: 'user',
    name: 'user_email_unique',
    key: { email: 1 },
    unique: true,
  },
  {
    collection: 'session',
    name: 'session_token_unique',
    key: { token: 1 },
    unique: true,
  },
  {
    collection: 'session',
    name: 'session_user_id',
    key: { userId: 1 },
  },
  {
    collection: 'session',
    name: 'session_expires_at_ttl',
    key: { expiresAt: 1 },
    expireAfterSeconds: 0,
  },
  {
    collection: 'account',
    name: 'account_provider_account_unique',
    key: { providerId: 1, accountId: 1 },
    unique: true,
  },
  {
    collection: 'account',
    name: 'account_user_id',
    key: { userId: 1 },
  },
  {
    collection: 'verification',
    name: 'verification_identifier_value_unique',
    key: { identifier: 1, value: 1 },
    unique: true,
  },
  {
    collection: 'verification',
    name: 'verification_expires_at_ttl',
    key: { expiresAt: 1 },
    expireAfterSeconds: 0,
  },
  {
    collection: 'pokemon_cache',
    name: 'pokemon_cache_pokemon_id_unique',
    key: { pokemonId: 1 },
    unique: true,
  },
  {
    collection: 'pokemon_cache',
    name: 'pokemon_cache_name_normalized_unique',
    key: { nameNormalized: 1 },
    unique: true,
  },
  {
    collection: 'pokemon_cache',
    name: 'pokemon_cache_types',
    key: { types: 1 },
  },
  {
    collection: 'pokemon_cache',
    name: 'pokemon_cache_generation',
    key: { generation: 1 },
  },
  {
    collection: 'collection_entries',
    name: 'collection_entries_user_pokemon_unique',
    key: { userId: 1, pokemonId: 1 },
    unique: true,
  },
  {
    collection: 'collection_entries',
    name: 'collection_entries_user_updated',
    key: { userId: 1, updatedAt: -1 },
  },
  {
    collection: 'collection_entries',
    name: 'collection_entries_user_favorite',
    key: { userId: 1, favorite: 1 },
  },
  {
    collection: 'collection_entries',
    name: 'collection_entries_user_tags',
    key: { userId: 1, tags: 1 },
  },
  {
    collection: 'ai_analyses',
    name: 'ai_analyses_user_status_updated',
    key: { userId: 1, status: 1, updatedAt: -1 },
  },
  {
    collection: 'ai_analyses',
    name: 'ai_analyses_user_type_created',
    key: { userId: 1, type: 1, createdAt: -1 },
  },
  {
    collection: 'ai_analyses',
    name: 'ai_analyses_expires_at_ttl',
    key: { expiresAt: 1 },
    expireAfterSeconds: 0,
  },
  {
    collection: 'conversations',
    name: 'conversations_user_updated',
    key: { userId: 1, updatedAt: -1 },
  },
  {
    collection: 'messages',
    name: 'messages_conversation_created',
    key: { conversationId: 1, createdAt: 1 },
  },
  {
    collection: 'ai_insights',
    name: 'ai_insights_user_type_version_unique',
    key: { userId: 1, type: 1, collectionVersion: 1 },
    unique: true,
  },
  {
    collection: 'ai_usage',
    name: 'ai_usage_user_period_unique',
    key: { userId: 1, period: 1 },
    unique: true,
  },
  {
    collection: 'research_expeditions',
    name: 'research_expeditions_user_status',
    key: { userId: 1, status: 1 },
  },
  {
    collection: 'research_expeditions',
    name: 'research_expeditions_user_updated',
    key: { userId: 1, updatedAt: -1 },
  },
  {
    collection: 'research_expeditions',
    name: 'research_expeditions_active_user_unique',
    key: { userId: 1 },
    unique: true,
    partialFilterExpression: { status: 'active' },
  },
] as const satisfies readonly IndexDefinition[]

export const PHASE_ZERO_INDEX_DEFINITIONS: readonly IndexDefinition[] =
  Object.freeze(definitions)

export const INDEX_DEFINITIONS = PHASE_ZERO_INDEX_DEFINITIONS
