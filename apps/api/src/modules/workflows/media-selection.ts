import type {
  MediaInput,
  NodeOutputResource,
  ResourceRef,
  ResourceRole,
} from '@mina/contracts/modules/tasks'
import type { MediaSlotName } from '@mina/contracts/modules/media'
import {
  findOutputByMediaView,
  findOutputBySelector,
  slotToInputRole,
  slotToResourceKind,
} from './media/media-input-builder'

export interface ResolvedMediaInput {
  input: MediaInput
  targetSlot: MediaSlotName
}

export const isNodeOutputResource = (resource: NodeOutputResource | ResourceRef): resource is NodeOutputResource =>
  typeof resource.id === 'string' && typeof resource.index === 'number' && resource.role !== undefined

export const mediaInputFromOutput = (
  resource: NodeOutputResource,
  role: ResourceRole,
  source: MediaInput['source'],
): MediaInput => ({
  kind: resource.kind,
  url: resource.url,
  role,
  ...(resource.mediaObjectId ? { mediaObjectId: resource.mediaObjectId } : {}),
  source,
  ...(resource.metadata ? { metadata: resource.metadata } : {}),
})

export const mediaInputFromResourceRef = (resource: ResourceRef, role: ResourceRole): MediaInput => ({
  kind: resource.kind,
  url: resource.url,
  role,
  ...(resource.metadata ? { metadata: resource.metadata } : {}),
})

export { findOutputByMediaView, findOutputBySelector, slotToInputRole, slotToResourceKind }
