import type { ChatEvent } from '@mina/contracts/modules/chat'

type ChatEventListener = (event: ChatEvent) => void

export interface ChatEventPublisher {
  publish(event: ChatEvent): void
}

export interface ChatEventSubscriber {
  subscribe(threadId: string, listener: ChatEventListener): () => void
}

export interface ChatEventBus extends ChatEventPublisher, ChatEventSubscriber {}

export class InMemoryChatEventBus implements ChatEventBus {
  readonly #listeners = new Map<string, Set<ChatEventListener>>()

  publish(event: ChatEvent): void {
    const listeners = this.#listeners.get(event.threadId)
    if (!listeners) {
      return
    }
    for (const listener of listeners) {
      listener(event)
    }
  }

  subscribe(threadId: string, listener: ChatEventListener): () => void {
    const listeners = this.#listeners.get(threadId) ?? new Set<ChatEventListener>()
    listeners.add(listener)
    this.#listeners.set(threadId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.#listeners.delete(threadId)
      }
    }
  }
}

export const createChatEventId = (): string => `chat_event_${crypto.randomUUID()}`
