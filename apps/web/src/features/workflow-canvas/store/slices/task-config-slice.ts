import { workflowYjsCommands, type WorkflowYjsCommandContext } from '../../sync/yjs/workflow-yjs-commands'
import type {
  CanvasSliceCreator,
  CanvasTaskConfigActions,
} from '../store-types'

export const createTaskConfigSlice: CanvasSliceCreator<
  CanvasTaskConfigActions
> = (_set, get) => {
  const context = (): WorkflowYjsCommandContext => {
    const { edges, nodes, workflowId } = get()
    return { edges, nodes, workflowId }
  }

  return {
    setNodeTaskConfig: (nodeId, task) =>
      workflowYjsCommands.setNodeTaskConfig(context(), nodeId, task),
    setNodeTaskPrompt: (nodeId, prompt) =>
      workflowYjsCommands.setNodeTaskPrompt(context(), nodeId, prompt),
    setNodeText: (nodeId, text) =>
      workflowYjsCommands.setNodeText(context(), nodeId, text),
  }
}
