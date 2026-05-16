import type { MediaSlotName } from '@mina/contracts/modules/media'
import type { MediaInput } from '@mina/contracts/modules/tasks'

import { mediaEnvelopeFromInputsBySlot, type MediaEnvelope } from '../tasks/config/media-envelope'

export const buildMediaEnvelope = (
  inputsBySlot: Partial<Record<MediaSlotName, MediaInput[]>>,
): MediaEnvelope => mediaEnvelopeFromInputsBySlot(inputsBySlot)
