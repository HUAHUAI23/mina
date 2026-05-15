import type { MediaInput } from '@mina/contracts/modules/tasks'

export interface MediaEnvelope {
  inputImages: MediaInput[]
  firstFrame?: MediaInput
  lastFrame?: MediaInput
  referenceImages: MediaInput[]
  referenceAudios: MediaInput[]
  referenceVideos: MediaInput[]
}

export const emptyMediaEnvelope = (): MediaEnvelope => ({
  inputImages: [],
  referenceImages: [],
  referenceAudios: [],
  referenceVideos: [],
})

export const mediaEnvelopeFromInputsBySlot = (
  inputsBySlot: Partial<Record<string, MediaInput[]>>,
): MediaEnvelope => ({
  inputImages: [...(inputsBySlot.inputImages ?? [])],
  ...(inputsBySlot.firstFrame?.[0] ? { firstFrame: inputsBySlot.firstFrame[0] } : {}),
  ...(inputsBySlot.lastFrame?.[0] ? { lastFrame: inputsBySlot.lastFrame[0] } : {}),
  referenceImages: [...(inputsBySlot.referenceImages ?? [])],
  referenceAudios: [...(inputsBySlot.referenceAudios ?? [])],
  referenceVideos: [...(inputsBySlot.referenceVideos ?? [])],
})
