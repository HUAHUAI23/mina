import type { MediaSlotName } from '@mina/contracts/modules/media'
import type { WorkflowNodeType } from '@mina/contracts/modules/canvas'

import { parseMediaSlotForNodeType } from './media-slot-policy'

export type MediaSlotHandleId = MediaSlotName

export const mediaSlotHandleId = (slot: MediaSlotName): MediaSlotHandleId => slot

export const mediaSlotFromHandleId = (
  nodeType: WorkflowNodeType,
  handleId: string | null | undefined,
): MediaSlotName | undefined => parseMediaSlotForNodeType(nodeType, handleId)
