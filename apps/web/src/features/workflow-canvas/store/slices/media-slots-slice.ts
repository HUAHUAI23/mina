import { workflowYjsCommands, type WorkflowYjsCommandContext } from '../../sync/yjs/workflow-yjs-commands'
import type {
  CanvasMediaSlotActions,
  CanvasSliceCreator,
} from '../store-types'

export const createMediaSlotsSlice: CanvasSliceCreator<
  CanvasMediaSlotActions
> = (_set, get) => {
  const context = (): WorkflowYjsCommandContext => {
    const { edges, nodes, workflowId } = get()
    return { edges, nodes, workflowId }
  }

  return {
    addSlotItem: (nodeId, item) => workflowYjsCommands.addSlotItem(context(), nodeId, item),
    removeSlotItem: (nodeId, slot, slotItemId) =>
      workflowYjsCommands.removeSlotItem(context(), nodeId, slot, slotItemId),
    reorderSlotItem: (nodeId, slot, slotItemId, direction) =>
      workflowYjsCommands.reorderSlotItem(context(), nodeId, slot, slotItemId, direction),
    reorderSlotItems: (nodeId, slot, orderedIds) =>
      workflowYjsCommands.reorderSlotItems(context(), nodeId, slot, orderedIds),
    replaceSlotItemMediaObject: (nodeId, slot, slotItemId, mediaObjectId) =>
      workflowYjsCommands.replaceSlotItemMediaObject(context(), nodeId, slot, slotItemId, mediaObjectId),
    setNodeMediaView: (nodeId, mediaView) =>
      workflowYjsCommands.setNodeMediaView(context(), nodeId, mediaView),
    updateSlotItem: (nodeId, item) => workflowYjsCommands.updateSlotItem(context(), nodeId, item),
  }
}
