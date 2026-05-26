import { create } from 'zustand'

interface WorkflowRuntimeActions {
  onRunNode(nodeId: string): void
  onSelectOutput(nodeId: string, taskId: string, outputResourceId: string, outputIndex: number): void
}

interface WorkflowRuntimeState {
  actions: WorkflowRuntimeActions
  runError: string | undefined
  runningNodeId: string | undefined
  setRuntime(input: {
    actions: WorkflowRuntimeActions
    runError?: string | undefined
    runningNodeId?: string | undefined
  }): void
}

const noopActions: WorkflowRuntimeActions = {
  onRunNode: () => undefined,
  onSelectOutput: () => undefined,
}

export const useWorkflowRuntimeStore = create<WorkflowRuntimeState>((set) => ({
  actions: noopActions,
  runError: undefined,
  runningNodeId: undefined,
  setRuntime: ({ actions, runError, runningNodeId }) =>
    set({
      actions,
      runError,
      runningNodeId,
    }),
}))
