import '@tanstack/react-start/server-only'

import { type Db, ObjectId, type WithId } from 'mongodb'

import {
  type AssistantCitation,
  type AssistantContextMessage,
  type AssistantConversation,
  type AssistantMessage,
  AssistantNotFoundError,
  type AssistantToolOperation,
  conversationQuerySchema,
  MAX_ASSISTANT_CONTEXT_MESSAGES,
} from '@/server/assistant/contracts'

type ConversationDocument = {
  userId: string
  title: string
  createdAt: Date
  updatedAt: Date
}

type MessageDocument = {
  userId: string
  conversationId: ObjectId
  role: 'user' | 'assistant'
  content: string
  citations: AssistantCitation[]
  toolCalls: AssistantToolOperation[]
  createdAt: Date
}

function cleanConversation(
  document: WithId<ConversationDocument>,
): AssistantConversation {
  const { _id, ...conversation } = document
  return { id: _id.toHexString(), ...conversation }
}

function cleanMessage(document: WithId<MessageDocument>): AssistantMessage {
  const { _id, conversationId, ...message } = document
  return {
    id: _id.toHexString(),
    conversationId: conversationId.toHexString(),
    ...message,
  }
}

export function createAssistantRepository(database: Db) {
  const conversations =
    database.collection<ConversationDocument>('conversations')
  const messages = database.collection<MessageDocument>('messages')

  async function ensureConversation(userId: string, id: string) {
    const conversation = await conversations.findOne({
      _id: new ObjectId(id),
      userId,
    })
    if (conversation === null) throw new AssistantNotFoundError()
    return conversation
  }

  async function prepareConversation(
    userId: string,
    conversationId: string | undefined,
    message: string,
    timestamp: Date,
  ) {
    if (conversationId !== undefined) {
      return ensureConversation(userId, conversationId)
    }
    const document: ConversationDocument = {
      userId,
      title: message.replace(/^\/\w+\s*/, '').slice(0, 60) || 'Nueva consulta',
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    const inserted = await conversations.insertOne(document)
    return { _id: inserted.insertedId, ...document }
  }

  async function loadContext(
    userId: string,
    conversationId: ObjectId,
  ): Promise<AssistantContextMessage[]> {
    const context = await messages
      .find({ userId, conversationId })
      .sort({ createdAt: -1 })
      .limit(MAX_ASSISTANT_CONTEXT_MESSAGES)
      .toArray()
    return context.reverse().map(({ role, content }) => ({ role, content }))
  }

  async function saveExchange(input: {
    userId: string
    conversationId: ObjectId
    userContent: string
    assistantContent: string
    citations: AssistantCitation[]
    toolCalls: AssistantToolOperation[]
    timestamp: Date
  }) {
    const userMessage: MessageDocument = {
      userId: input.userId,
      conversationId: input.conversationId,
      role: 'user',
      content: input.userContent,
      citations: [],
      toolCalls: [],
      createdAt: input.timestamp,
    }
    const assistantMessage: MessageDocument = {
      userId: input.userId,
      conversationId: input.conversationId,
      role: 'assistant',
      content: input.assistantContent,
      citations: input.citations,
      toolCalls: input.toolCalls,
      createdAt: new Date(input.timestamp.getTime() + 1),
    }
    const inserted = await messages.insertMany([userMessage, assistantMessage])
    await conversations.updateOne(
      { _id: input.conversationId, userId: input.userId },
      { $set: { updatedAt: assistantMessage.createdAt } },
    )
    return {
      conversationId: input.conversationId.toHexString(),
      message: cleanMessage({
        _id: inserted.insertedIds[1],
        ...assistantMessage,
      }),
    }
  }

  async function history(userId: string, input: unknown = {}) {
    const parsed = conversationQuerySchema.parse(input)
    const ownedConversations = await conversations
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50)
      .toArray()
    if (parsed.conversationId === undefined) {
      return { conversations: ownedConversations.map(cleanConversation) }
    }

    await ensureConversation(userId, parsed.conversationId)
    const conversationId = new ObjectId(parsed.conversationId)
    const ownedMessages = await messages
      .find({ userId, conversationId })
      .sort({ createdAt: 1 })
      .limit(100)
      .toArray()
    return {
      conversations: ownedConversations.map(cleanConversation),
      messages: ownedMessages.map(cleanMessage),
    }
  }

  return { history, loadContext, prepareConversation, saveExchange }
}
