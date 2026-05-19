import { produce } from 'immer'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import { commitDraftChanged } from '../store-helpers'
import type {
  CanvasStore,
  CanvasSliceCreator,
  CanvasTaskConfigActions,
} from '../store-types'

export const createTaskConfigSlice: CanvasSliceCreator<
  CanvasTaskConfigActions
> = (set) => ({
  setNodeTaskConfig: (nodeId, task) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item: WorkflowCanvasNode) => item.id === nodeId)
        if (!isMediaGenerationNode(node)) {
          return
        }
        node.data.config.task = task
        commitDraftChanged(state)
      }),
    ),
  setNodeText: (nodeId, text) =>
    set(
      produce<CanvasStore>((state) => {
        const node = state.nodes.find((item: WorkflowCanvasNode) => item.id === nodeId)
        if (node?.data.nodeType !== 'text') {
          return
        }
        node.data.config.text = text
        commitDraftChanged(state)
      }),
    ),
})
