import type {
  MediaInput,
} from '@mina/contracts/modules/tasks'
import type { MediaSlotConnection } from '@mina/contracts/modules/canvas'

import { mediaEnvelopeFromInputsBySlot, type MediaEnvelope } from '../tasks/config/media-envelope'

export const buildMediaEnvelope = (
  inputsBySlot: Partial<Record<MediaSlotConnection['targetSlot'], MediaInput[]>>,
): MediaEnvelope => mediaEnvelopeFromInputsBySlot(inputsBySlot)
