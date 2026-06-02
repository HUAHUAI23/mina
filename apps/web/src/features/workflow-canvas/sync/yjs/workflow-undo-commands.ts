import { getWorkflowYjsRuntimeForWorkflow } from './workflow-yjs-store'

export const workflowUndoCommands = {
  canRedo(workflowId: string): boolean {
    return getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.canRedo() ?? false
  },

  canUndo(workflowId: string): boolean {
    return getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.canUndo() ?? false
  },

  clear(workflowId: string): void {
    getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.clear()
  },

  redo(workflowId: string): void {
    getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.redo()
  },

  stopCapturing(workflowId: string): void {
    getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.stopCapturing()
  },

  undo(workflowId: string): void {
    getWorkflowYjsRuntimeForWorkflow(workflowId)?.undo.undo()
  },
}
