import { workflowYjsCommands, type WorkflowYjsCommandContext } from '../../sync/yjs/workflow-yjs-commands'
import { workflowUndoCommands } from '../../sync/yjs/workflow-undo-commands'
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
    addConnectedMediaGenerationNode: (input) => workflowYjsCommands.addConnectedMediaGenerationNode(context(), input),
    addMediaConnection: (input) => workflowYjsCommands.addMediaConnection(context(), input),
    addMediaGenerationNode: (input) => workflowYjsCommands.addMediaGenerationNode(context(), input),
    addNode: (type, task, options) => workflowYjsCommands.addNode(context(), type, task, options),
    addNodesToGroup: (groupNodeId, nodeIds, options) => workflowYjsCommands.addNodesToGroup(context(), groupNodeId, nodeIds, options),
    commitNodeFrames: (frames) => workflowYjsCommands.commitNodeFrames(context(), frames),
    convertGroupNodeType: (nodeId, targetType) => workflowYjsCommands.convertGroupNodeType(context(), nodeId, targetType),
    detachGraphNodes: (nodeIds) => workflowYjsCommands.detachGraphNodes(context(), nodeIds),
    fitGroupNodeToChildren: (nodeId) => workflowYjsCommands.fitGroupNodeToChildren(context(), nodeId),
    groupGraphNodes: (nodeIds, groupType) => workflowYjsCommands.groupGraphNodes(context(), nodeIds, groupType),
    redo: () => workflowUndoCommands.redo(get().workflowId),
    removeGraphEdges: (edgeIds) => workflowYjsCommands.removeGraphEdges(context(), edgeIds),
    removeGraphNodes: (nodeIds) => workflowYjsCommands.removeGraphNodes(context(), nodeIds),
    ungroupGraphNode: (nodeId) => workflowYjsCommands.ungroupGraphNode(context(), nodeId),
    setNodeFrame: (input) => workflowYjsCommands.setNodeFrame(context(), input),
    undo: () => workflowUndoCommands.undo(get().workflowId),
  }
}
