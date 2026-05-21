import { z } from 'zod'

export const GOOGLE_VIDEO_ASPECT_RATIOS = ['16:9', '9:16'] as const
export const GOOGLE_VIDEO_DURATIONS = [4, 6, 8] as const
export const GOOGLE_VIDEO_PERSON_GENERATION = ['allow_all', 'allow_adult'] as const
export const GOOGLE_VIDEO_RESOLUTIONS = ['720p', '1080p', '4k'] as const

export const VOLCENGINE_VIDEO_RATIOS = ['16:9', '4:3', '1:1', '3:4', '9:16', '21:9', 'adaptive'] as const
export const VOLCENGINE_VIDEO_RESOLUTIONS = ['480p', '720p', '1080p'] as const
export const VOLCENGINE_VIDEO_SERVICE_TIERS = ['default', 'flex'] as const

export const GoogleVeoParamsSchema = z.object({
  aspectRatio: z.enum(GOOGLE_VIDEO_ASPECT_RATIOS).default('16:9'),
  durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).default(8),
  personGeneration: z.enum(GOOGLE_VIDEO_PERSON_GENERATION).default('allow_all'),
  resolution: z.enum(GOOGLE_VIDEO_RESOLUTIONS).default('720p'),
})

export const VolcengineSeedanceParamsSchema = z.object({
  cameraFixed: z.boolean().optional(),
  durationSeconds: z.number().int().min(1).default(5),
  generateAudio: z.boolean().optional(),
  ratio: z.enum(VOLCENGINE_VIDEO_RATIOS).default('16:9'),
  resolution: z.enum(VOLCENGINE_VIDEO_RESOLUTIONS).default('720p'),
  returnLastFrame: z.boolean().default(false),
  serviceTier: z.enum(VOLCENGINE_VIDEO_SERVICE_TIERS).optional(),
  webSearch: z.boolean().default(false),
})

export type GoogleVeoParams = z.infer<typeof GoogleVeoParamsSchema>
export type VolcengineSeedanceParams = z.infer<typeof VolcengineSeedanceParamsSchema>
