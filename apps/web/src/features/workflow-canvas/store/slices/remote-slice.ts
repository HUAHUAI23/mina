import { produce } from 'immer'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import { indexNodes } from '../store-helpers'
import type {
  CanvasStore,
  CanvasRemoteActions,
  CanvasRemoteState,
  CanvasSliceCreator,
} from '../store-types'

export const initialRemoteState: CanvasRemoteState = {
  remoteUpdatePending: false,
  remoteVersion: undefined,
}

export const createRemoteSlice: CanvasSliceCreator<
  CanvasRemoteState & CanvasRemoteActions
> = (set) => ({
  ...initialRemoteState,
  applyRemoteMediaView: (nodeId, mediaView, version) =>
    set((state) => {
      const nodes = state.nodes.map((node: WorkflowCanvasNode) => {
        if (node.id !== nodeId || !isMediaGenerationNode(node)) {
          return node
        }
        const { mediaView: _mediaView, ...dataWithoutMediaView } = node.data
        return {
          ...node,
          data: mediaView ? { ...node.data, mediaView } : dataWithoutMediaView,
        }
      })
      return {
        nodeIndexById: indexNodes(nodes),
        nodes,
        version,
      }
    }),
  clearRemoteUpdate: () =>
    set({ remoteUpdatePending: false, remoteVersion: undefined }),
  setRemoteUpdate: (version) =>
    set(
      produce<CanvasStore>((state) => {
        state.remoteUpdatePending = true
        state.remoteVersion = version
      }),
    ),
})
