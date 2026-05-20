import type { WorkflowAwarenessState } from '../workflow-presence'

interface WorkflowAwarenessProtocol {
  clientID: number
  getStates(): Map<number, unknown>
  setLocalState(state: WorkflowAwarenessState): void
}

export const applyLocalWorkflowAwareness = (
  awareness: WorkflowAwarenessProtocol,
  state: WorkflowAwarenessState,
): void => {
  awareness.setLocalState(state)
}

export const readRemoteWorkflowAwareness = (
  awareness: WorkflowAwarenessProtocol,
): Record<string, WorkflowAwarenessState> => {
  const localClientId = awareness.clientID
  const peers: Record<string, WorkflowAwarenessState> = {}
  for (const [clientId, value] of awareness.getStates()) {
    if (clientId === localClientId || !value || typeof value !== 'object') {
      continue
    }
    const state = value as WorkflowAwarenessState
    peers[state.user.id] = state
  }
  return peers
}
