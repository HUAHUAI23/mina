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

const resourceKey = (resource: NodeOutputResource | undefined): string =>
  resource ? `${resource.id}:${resource.kind}:${resource.role ?? ''}:${resource.index}:${resource.url}` : ''

const previewSignature = (preview: NodeMediaPreview): string =>
  JSON.stringify({
    poster: resourceKey(preview.poster),
    resource: resourceKey(preview.resource),
    resources: preview.resources.map(resourceKey),
  })

export const useMediaPreviewStore = create<MediaPreviewStore>((set) => ({
  previewByNodeId: {},
  setNodePreview: (nodeId, preview) =>
    set((state) => {
      const current = state.previewByNodeId[nodeId]
      if (current && previewSignature(current) === previewSignature(preview)) {
        return state
      }
      return {
        previewByNodeId: {
          ...state.previewByNodeId,
          [nodeId]: preview,
        },
      }
    }),
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
