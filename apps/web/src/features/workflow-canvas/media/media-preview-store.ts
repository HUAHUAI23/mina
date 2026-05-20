import { create } from 'zustand'
import type { NodeMediaViewState } from '@mina/contracts/modules/canvas'
import type { NodeExecutionOutput, NodeOutputResource } from '@mina/contracts/modules/tasks'

import { primarySelectableResources, resolveMediaViewResource, videoPosterResource } from '../utils/media-view'

export interface NodeMediaPreview {
  poster?: NodeOutputResource | undefined
  resource?: NodeOutputResource | undefined
  resources: NodeOutputResource[]
}

interface MediaPreviewStore {
  previewByNodeId: Record<string, NodeMediaPreview>
  setNodePreview(nodeId: string, preview: NodeMediaPreview): void
}

export const useMediaPreviewStore = create<MediaPreviewStore>((set) => ({
  previewByNodeId: {},
  setNodePreview: (nodeId, preview) =>
    set((state) => ({
      previewByNodeId: {
        ...state.previewByNodeId,
        [nodeId]: preview,
      },
    })),
}))

export const createNodeMediaPreview = (
  input: {
    mediaView?: NodeMediaViewState | undefined
    nodeType: 'image_generation' | 'video_generation'
    output?: NodeExecutionOutput | undefined
  },
): NodeMediaPreview => {
  const resource = resolveMediaViewResource(input.output, input.mediaView)
  return {
    poster: input.nodeType === 'video_generation' ? videoPosterResource(input.output, resource) : undefined,
    resource,
    resources: primarySelectableResources(input.output),
  }
}
