import { z } from 'zod'

export const MediaSlotNameSchema = z.enum([
  'inputImages',
  'firstFrame',
  'lastFrame',
  'referenceImages',
  'referenceAudios',
  'referenceVideos',
])

export type MediaSlotName = z.infer<typeof MediaSlotNameSchema>
