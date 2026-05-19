import type { WorkflowNodeType } from '@mina/contracts/modules/canvas'
import type {
  MediaSlotName,
  NodeMediaSlotItem,
  NodeMediaSlots,
  NodeOutputSelector,
} from '@mina/contracts/modules/media'
import type { ResourceKind } from '@mina/contracts/modules/tasks'

export interface MediaSlotDescriptor {
  accept: string
  kind: ResourceKind
  label: string
  slot: MediaSlotName
}

const imageInputSlot: MediaSlotDescriptor = {
  accept: 'image/*',
  kind: 'image',
  label: 'Input media',
  slot: 'inputImages',
}

const videoSlotPolicy: MediaSlotDescriptor[] = [
  {
    accept: 'image/*',
    kind: 'image',
    label: 'First frame',
    slot: 'firstFrame',
  },
  {
    accept: 'image/*',
    kind: 'image',
    label: 'Last frame',
    slot: 'lastFrame',
  },
  {
    accept: 'video/*',
    kind: 'video',
    label: 'Reference video',
    slot: 'referenceVideos',
  },
  {
    accept: 'audio/*',
    kind: 'audio',
    label: 'Reference audio',
    slot: 'referenceAudios',
  },
]

export const mediaSlotsForNodeType = (
  nodeType: WorkflowNodeType,
): MediaSlotDescriptor[] => {
  if (nodeType === 'image_generation') {
    return [imageInputSlot]
  }
  if (nodeType === 'video_generation') {
    return videoSlotPolicy
  }
  return []
}

export const isMediaSlotAllowedForNodeType = (
  nodeType: WorkflowNodeType,
  slot: MediaSlotName,
): boolean =>
  mediaSlotsForNodeType(nodeType).some((descriptor) => descriptor.slot === slot)

export const parseMediaSlotForNodeType = (
  nodeType: WorkflowNodeType,
  value: string | null | undefined,
): MediaSlotName | undefined => {
  if (!value) {
    return undefined
  }
  return mediaSlotsForNodeType(nodeType).find((descriptor) => descriptor.slot === value)?.slot
}

export const defaultMediaSlotForNodeType = (
  nodeType: WorkflowNodeType,
): MediaSlotName | undefined => mediaSlotsForNodeType(nodeType)[0]?.slot

export const coerceMediaSlotForNodeType = (
  nodeType: WorkflowNodeType,
  requestedSlot: MediaSlotName | undefined,
): MediaSlotName | undefined => {
  if (requestedSlot && isMediaSlotAllowedForNodeType(nodeType, requestedSlot)) {
    return requestedSlot
  }
  return defaultMediaSlotForNodeType(nodeType)
}

export const normalizeMediaSlotsForNodeType = (
  nodeType: WorkflowNodeType,
  mediaSlots: NodeMediaSlots | undefined,
): NodeMediaSlots => {
  const allowedSlots = new Set(
    mediaSlotsForNodeType(nodeType).map((descriptor) => descriptor.slot),
  )
  const next: NodeMediaSlots = {}

  for (const slot of allowedSlots) {
    const items = mediaSlots?.[slot]?.filter((item) => item.slot === slot)
    if (items?.length) {
      next[slot] = items
    }
  }

  return next
}

export const defaultSelectorForMediaSlot = (
  slot: MediaSlotName,
): NodeOutputSelector => {
  if (slot === 'referenceVideos') {
    return { resourceKind: 'video', role: 'generated_video', index: 0 }
  }
  if (slot === 'lastFrame') {
    return { resourceKind: 'image', role: 'last_frame', index: 0 }
  }
  if (slot === 'firstFrame') {
    return { resourceKind: 'image', role: 'first_frame', index: 0 }
  }
  return { resourceKind: 'image', role: 'generated_image', index: 0 }
}

export const slotItemsForNodeType = (
  nodeType: WorkflowNodeType,
  mediaSlots: NodeMediaSlots | undefined,
): NodeMediaSlotItem[] =>
  mediaSlotsForNodeType(nodeType).flatMap(
    ({ slot }) => mediaSlots?.[slot] ?? [],
  )
