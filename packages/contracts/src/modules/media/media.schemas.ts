import { z } from 'zod'

import {
  ResourceKindSchema,
  ResourceMetadataSchema,
  ResourceRoleSchema,
} from '../tasks/task.schemas'
import { MediaSlotNameSchema } from './slot.schemas'

export { MediaSlotNameSchema } from './slot.schemas'
export type { MediaSlotName } from './slot.schemas'

export const NodeOutputSelectorSchema = z.object({
  resourceKind: ResourceKindSchema,
  role: ResourceRoleSchema,
  index: z.number().int().min(0),
})

export const NodeMediaSlotSourceSchema = z.union([
  z.object({
    type: z.literal('media_object'),
    mediaObjectId: z.string().min(1),
  }),
  z.object({
    type: z.literal('external_url'),
    kind: ResourceKindSchema,
    url: z.string().min(1),
    metadata: ResourceMetadataSchema.optional(),
  }),
  z.object({
    type: z.literal('node_output'),
    nodeId: z.string().min(1),
    resolve: z.literal('current_media'),
  }),
  z.object({
    type: z.literal('node_output'),
    nodeId: z.string().min(1),
    resolve: z.literal('run_output'),
    selector: NodeOutputSelectorSchema,
  }),
])

export const NodeMediaSlotItemSchema = z.object({
  id: z.string().min(1),
  slot: MediaSlotNameSchema,
  order: z.number().int().nonnegative(),
  required: z.boolean().default(true),
  source: NodeMediaSlotSourceSchema,
})

export const NodeMediaSlotsSchema = z
  .partialRecord(MediaSlotNameSchema, z.array(NodeMediaSlotItemSchema))
  .default({})

export const WorkflowMediaLinkConnectionSchema = z.object({
  kind: z.literal('media_link'),
  targetSlot: MediaSlotNameSchema,
  targetSlotItemId: z.string().min(1),
})

export type NodeMediaSlotItem = z.infer<typeof NodeMediaSlotItemSchema>
export type NodeMediaSlotSource = z.infer<typeof NodeMediaSlotSourceSchema>
export type NodeMediaSlots = z.infer<typeof NodeMediaSlotsSchema>
export type NodeOutputSelector = z.infer<typeof NodeOutputSelectorSchema>
export type WorkflowMediaLinkConnection = z.infer<typeof WorkflowMediaLinkConnectionSchema>
