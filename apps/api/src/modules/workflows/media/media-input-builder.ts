import type { MediaSlotName, NodeMediaSlotItem } from '@mina/contracts/modules/media'
import type { MediaInput, NodeOutputResource, ResourceKind, ResourceRole } from '@mina/contracts/modules/tasks'

export const slotToInputRole = (slot: MediaSlotName): ResourceRole => {
  if (slot === 'inputImages') return 'reference_image'
  if (slot === 'firstFrame') return 'first_frame'
  if (slot === 'lastFrame') return 'last_frame'
  if (slot === 'referenceAudios') return 'reference_audio'
  if (slot === 'referenceVideos') return 'reference_video'
  return 'reference_image'
}

export const slotToResourceKind = (slot: MediaSlotName): ResourceKind => {
  if (slot === 'referenceAudios') return 'audio'
  if (slot === 'referenceVideos') return 'video'
  return 'image'
}

export const mediaInputWithSlotMetadata = (
  input: MediaInput,
  item: Pick<NodeMediaSlotItem, 'id' | 'order' | 'slot'>,
): MediaInput => ({
  ...input,
  metadata: {
    ...(input.metadata ?? {}),
    slot: item.slot,
    slotItemId: item.id,
    slotOrder: item.order,
  },
})

export const findOutputBySelector = (
  output: { resources: NodeOutputResource[] },
  resourceKind: ResourceKind,
  role: ResourceRole,
  index: number,
): NodeOutputResource | undefined =>
  output.resources.filter((resource) => resource.kind === resourceKind && resource.role === role)[index]

export const findOutputByMediaView = (
  output: { resources: NodeOutputResource[] },
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
