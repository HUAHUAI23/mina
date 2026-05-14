import type {
  MediaInput,
  NodeExecutionOutput,
  NodeOutputResource,
  ResourceKind,
  ResourceRef,
  ResourceRole,
} from '@mina/contracts/modules/tasks'
import type { MediaSlotConnection } from '@mina/contracts/modules/canvas'

export interface ResolvedMediaInput {
  input: MediaInput
  targetSlot: MediaSlotConnection['targetSlot']
}

export const isNodeOutputResource = (resource: NodeOutputResource | ResourceRef): resource is NodeOutputResource =>
  typeof resource.id === 'string' && typeof resource.index === 'number' && resource.role !== undefined

export const slotToInputRole = (slot: MediaSlotConnection['targetSlot']): ResourceRole => {
  if (slot === 'firstFrame') return 'first_frame'
  if (slot === 'lastFrame') return 'last_frame'
  if (slot === 'referenceAudios') return 'reference_audio'
  if (slot === 'referenceVideos') return 'reference_video'
  return 'reference_image'
}

export const slotToResourceKind = (slot: MediaSlotConnection['targetSlot']): ResourceKind | undefined => {
  if (slot === 'referenceAudios') return 'audio'
  if (slot === 'referenceVideos') return 'video'
  if (slot === 'prompt') return undefined
  return 'image'
}

export const mediaInputFromOutput = (
  resource: NodeOutputResource,
  role: ResourceRole,
  source: MediaInput['source'],
): MediaInput => ({
  kind: resource.kind,
  url: resource.url,
  role,
  source,
  ...(resource.metadata ? { metadata: resource.metadata } : {}),
})

export const mediaInputFromResourceRef = (resource: ResourceRef, role: ResourceRole): MediaInput => ({
  kind: resource.kind,
  url: resource.url,
  role,
  ...(resource.metadata ? { metadata: resource.metadata } : {}),
})

export const findOutputBySelector = (
  output: NodeExecutionOutput,
  resourceKind: ResourceKind,
  role: ResourceRole,
  index: number,
): NodeOutputResource | undefined =>
  output.resources.find(
    (resource) => resource.kind === resourceKind && resource.role === role && resource.index === index,
  )

export const findOutputByMediaView = (
  output: NodeExecutionOutput,
  outputResourceId: string | undefined,
  outputIndex: number | undefined,
): NodeOutputResource | undefined => {
  if (outputResourceId) {
    const byId = output.resources.find((resource) => resource.id === outputResourceId)
    if (byId) {
      return byId
    }
  }

  if (outputIndex !== undefined) {
    return output.resources[outputIndex]
  }

  return output.resources[0]
}
