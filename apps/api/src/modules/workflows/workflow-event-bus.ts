import type { WorkflowEvent } from '@mina/contracts/modules/workflows/events'

type WorkflowEventListener = (event: WorkflowEvent) => void

export interface WorkflowEventBus {
  publish(event: WorkflowEvent): void
  subscribe(workflowId: string, listener: WorkflowEventListener): () => void
}

export class InMemoryWorkflowEventBus implements WorkflowEventBus {
  readonly #listeners = new Map<string, Set<WorkflowEventListener>>()

  publish(event: WorkflowEvent): void {
    const listeners = this.#listeners.get(event.workflowId)
    if (!listeners) {
      return
    }
    for (const listener of listeners) {
      listener(event)
    }
  }

  subscribe(workflowId: string, listener: WorkflowEventListener): () => void {
    const listeners = this.#listeners.get(workflowId) ?? new Set<WorkflowEventListener>()
    listeners.add(listener)
    this.#listeners.set(workflowId, listeners)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.#listeners.delete(workflowId)
      }
    }
  }
}

export const createWorkflowEventId = (): string => `workflow_event_${crypto.randomUUID()}`
