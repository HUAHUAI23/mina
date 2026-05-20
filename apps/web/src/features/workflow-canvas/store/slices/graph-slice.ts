import { workflowYjsCommands, type WorkflowYjsCommandContext } from '../../sync/yjs/workflow-yjs-commands'
import type {
  CanvasGraphActions,
  CanvasGraphState,
  CanvasSliceCreator,
} from '../store-types'

export const initialGraphState: CanvasGraphState = {
  edges: [],
  name: '',
  nodeIndexById: {},
  nodes: [],
  workflowId: '',
}

export const createGraphSlice: CanvasSliceCreator<
  CanvasGraphState & CanvasGraphActions
> = (_set, get) => {
  const context = (): WorkflowYjsCommandContext => {
    const { edges, nodes, workflowId } = get()
    return { edges, nodes, workflowId }
  }
  return {
    ...initialGraphState,
    addMediaConnection: (input) => workflowYjsCommands.addMediaConnection(context(), input),
    addNode: (type) => workflowYjsCommands.addNode(context(), type),
    commitNodeFrames: (frames) => workflowYjsCommands.commitNodeFrames(context(), frames),
    removeGraphEdges: (edgeIds) => workflowYjsCommands.removeGraphEdges(context(), edgeIds),
    removeGraphNodes: (nodeIds) => workflowYjsCommands.removeGraphNodes(context(), nodeIds),
    setNodeFrame: (input) => workflowYjsCommands.setNodeFrame(context(), input),
  }
}
