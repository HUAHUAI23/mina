import type { WorkflowNodeType } from '@mina/contracts/modules/canvas'
import type {
  MediaSlotName,
  NodeMediaSlotItem,
  NodeMediaSlots,
  NodeOutputSelector,
} from '@mina/contracts/modules/media'
import type { ResourceKind } from '@mina/contracts/modules/tasks'

import { baseMessages, type WebMessages } from '../../../lib/i18n-messages'
import type { ClientModelMediaCapabilities, ImageInputLimit } from '../forms/registry/client-model-registry'

export interface MediaSlotDescriptor {
  accept: string
  kind: ResourceKind
  label: string
  maxItems?: number | undefined
  slot: MediaSlotName
}

const imageInputSlot = (m: WebMessages): MediaSlotDescriptor => ({
  accept: 'image/*',
  kind: 'image',
  label: m.workflow_canvas_input_media(),
  slot: 'inputImages',
})

const videoSlotPolicy = (m: WebMessages): MediaSlotDescriptor[] => [
  {
    accept: 'image/*',
    kind: 'image',
    label: m.workflow_canvas_first_frame(),
    slot: 'firstFrame',
  },
  {
    accept: 'image/*',
    kind: 'image',
    label: m.workflow_canvas_last_frame(),
    slot: 'lastFrame',
  },
  {
    accept: 'image/*',
    kind: 'image',
    label: m.workflow_canvas_reference_image(),
    slot: 'referenceImages',
  },
  {
    accept: 'video/*',
    kind: 'video',
    label: m.workflow_canvas_reference_video(),
    slot: 'referenceVideos',
  },
  {
    accept: 'audio/*',
    kind: 'audio',
    label: m.workflow_canvas_reference_audio(),
    slot: 'referenceAudios',
  },
]

const resolveSlotMessages = (messages: WebMessages | undefined): WebMessages => messages ?? baseMessages

const capabilityForSlot = (
  capabilities: ClientModelMediaCapabilities,
  slot: MediaSlotName,
): ImageInputLimit | boolean | undefined => {
  if (slot === 'inputImages') {
    return capabilities.inputImages
  }
  if (slot === 'firstFrame') {
    return capabilities.firstFrame
  }
  if (slot === 'lastFrame') {
    return capabilities.lastFrame
  }
  if (slot === 'referenceAudios') {
    return capabilities.referenceAudios
  }
  if (slot === 'referenceImages') {
    return capabilities.referenceImages
  }
  return capabilities.referenceVideos
}

const withCapabilities = (
  descriptors: readonly MediaSlotDescriptor[],
  capabilities: ClientModelMediaCapabilities | undefined,
): MediaSlotDescriptor[] => {
  if (!capabilities) {
    return [...descriptors]
  }
  return descriptors.flatMap((descriptor) => {
    const capability = capabilityForSlot(capabilities, descriptor.slot)
    if (!capability) {
      return []
    }
    if (typeof capability === 'object') {
      if (capability.max <= 0) {
        return []
      }
      return [{ ...descriptor, maxItems: capability.max }]
    }
    return [descriptor]
  })
}

export const mediaSlotsForNodeType = (
  nodeType: WorkflowNodeType,
  capabilities?: ClientModelMediaCapabilities | undefined,
  messages?: WebMessages | undefined,
): MediaSlotDescriptor[] => {
  const m = resolveSlotMessages(messages)
  const descriptors = {
    imageInputSlot: imageInputSlot(m),
    videoSlotPolicy: videoSlotPolicy(m),
  }
  if (nodeType === 'image_generation') {
    return withCapabilities([descriptors.imageInputSlot], capabilities)
  }
  if (nodeType === 'video_generation') {
    return withCapabilities(descriptors.videoSlotPolicy, capabilities)
  }
  return []
}

export const isMediaSlotAllowedForNodeType = (
  nodeType: WorkflowNodeType,
  slot: MediaSlotName,
  capabilities?: ClientModelMediaCapabilities | undefined,
  messages?: WebMessages | undefined,
): boolean =>
  mediaSlotsForNodeType(nodeType, capabilities, messages).some((descriptor) => descriptor.slot === slot)

export const parseMediaSlotForNodeType = (
  nodeType: WorkflowNodeType,
  value: string | null | undefined,
  capabilities?: ClientModelMediaCapabilities | undefined,
  messages?: WebMessages | undefined,
): MediaSlotName | undefined => {
  if (!value) {
    return undefined
  }
  return mediaSlotsForNodeType(nodeType, capabilities, messages).find((descriptor) => descriptor.slot === value)?.slot
}

export const defaultMediaSlotForNodeType = (
  nodeType: WorkflowNodeType,
  capabilities?: ClientModelMediaCapabilities | undefined,
  messages?: WebMessages | undefined,
): MediaSlotName | undefined => mediaSlotsForNodeType(nodeType, capabilities, messages)[0]?.slot

export const coerceMediaSlotForNodeType = (
  nodeType: WorkflowNodeType,
  requestedSlot: MediaSlotName | undefined,
  capabilities?: ClientModelMediaCapabilities | undefined,
  messages?: WebMessages | undefined,
): MediaSlotName | undefined => {
  if (requestedSlot && isMediaSlotAllowedForNodeType(nodeType, requestedSlot, capabilities, messages)) {
    return requestedSlot
  }
  return defaultMediaSlotForNodeType(nodeType, capabilities, messages)
}

export const normalizeMediaSlotsForNodeType = (
  nodeType: WorkflowNodeType,
  mediaSlots: NodeMediaSlots | undefined,
  capabilities?: ClientModelMediaCapabilities | undefined,
  messages?: WebMessages | undefined,
): NodeMediaSlots => {
  const next: NodeMediaSlots = {}

  const descriptorsBySlot = new Map(mediaSlotsForNodeType(nodeType, capabilities, messages).map((descriptor) => [descriptor.slot, descriptor]))
  for (const [slot, descriptor] of descriptorsBySlot) {
    const items = mediaSlots?.[slot]?.filter((item) => item.slot === slot)
    const limitedItems = descriptor.maxItems === undefined ? items : items?.slice(0, descriptor.maxItems)
    if (limitedItems?.length) {
      next[slot] = limitedItems
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
  capabilities?: ClientModelMediaCapabilities | undefined,
  messages?: WebMessages | undefined,
): NodeMediaSlotItem[] =>
  mediaSlotsForNodeType(nodeType, capabilities, messages).flatMap(
    ({ slot }) => mediaSlots?.[slot] ?? [],
  )
