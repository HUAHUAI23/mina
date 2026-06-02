import { useCallback, useSyncExternalStore } from 'react'

import {
  getWorkflowYjsRuntimeForWorkflow,
  subscribeWorkflowYjsRuntime,
} from './workflow-yjs-store'

export interface WorkflowUndoState {
  canRedo: boolean
  canUndo: boolean
}

const EMPTY_UNDO_STATE: WorkflowUndoState = {
  canRedo: false,
  canUndo: false,
}

const undoStateCache = new Map<string, WorkflowUndoState>()
const UNDO_STACK_EVENTS = [
  'stack-item-added',
  'stack-item-updated',
  'stack-item-popped',
  'stack-cleared',
] as const

type WorkflowUndoManager = NonNullable<ReturnType<typeof getWorkflowYjsRuntimeForWorkflow>>['undo']

const readWorkflowUndoState = (workflowId: string): WorkflowUndoState => {
  const undo = getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo
  if (!undo) {
    undoStateCache.delete(workflowId)
    return EMPTY_UNDO_STATE
  }

  const nextState: WorkflowUndoState = {
    canRedo: undo.canRedo(),
    canUndo: undo.canUndo(),
  }
  const previousState = undoStateCache.get(workflowId)
  if (
    previousState &&
    previousState.canRedo === nextState.canRedo &&
    previousState.canUndo === nextState.canUndo
  ) {
    return previousState
  }
  undoStateCache.set(workflowId, nextState)
  return nextState
}

const subscribeUndoStack = (
  undo: WorkflowUndoManager,
  onStoreChange: () => void,
): (() => void) => {
  for (const eventName of UNDO_STACK_EVENTS) {
    undo.on(eventName, onStoreChange)
  }
  return () => {
    for (const eventName of UNDO_STACK_EVENTS) {
      undo.off(eventName, onStoreChange)
    }
  }
}

const subscribeWorkflowUndoState = (
  workflowId: string,
  onStoreChange: () => void,
): (() => void) => {
  let currentUndo: WorkflowUndoManager | undefined
  let unsubscribeUndo: (() => void) | undefined

  const bindUndoStack = () => {
    const nextUndo = getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo
    if (nextUndo === currentUndo) {
      return
    }
    unsubscribeUndo?.()
    currentUndo = nextUndo
    unsubscribeUndo = nextUndo ? subscribeUndoStack(nextUndo, onStoreChange) : undefined
  }

  bindUndoStack()
  const unsubscribeRuntime = subscribeWorkflowYjsRuntime(workflowId, () => {
    bindUndoStack()
    onStoreChange()
  })

  return () => {
    unsubscribeRuntime()
    unsubscribeUndo?.()
  }
}

export const useWorkflowUndoState = (workflowId: string): WorkflowUndoState => {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeWorkflowUndoState(workflowId, onStoreChange),
    [workflowId],
  )
  const getSnapshot = useCallback(() => readWorkflowUndoState(workflowId), [workflowId])
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_UNDO_STATE)
}
