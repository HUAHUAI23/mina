import { z } from 'zod'

export const GOOGLE_IMAGE_ASPECT_RATIOS = [
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
] as const

export const GOOGLE_IMAGE_SIZES = ['512', '1K', '2K', '4K'] as const

export const GOOGLE_IMAGE_PRO_ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '4:5',
  '5:4',
  '9:16',
  '16:9',
  '21:9',
] as const

export const GOOGLE_IMAGE_PRO_SIZES = ['1K', '2K', '4K'] as const

export const VOLCENGINE_SEEDREAM_5_SIZES = ['2048x2048', '2K', '3K'] as const
export const VOLCENGINE_SEEDREAM_4_5_SIZES = ['2048x2048', '2K', '4K'] as const

export const GoogleGeminiImageParamsSchema = z.object({
  aspectRatio: z.enum(GOOGLE_IMAGE_ASPECT_RATIOS).default('1:1'),
  count: z.number().int().min(1).max(16).default(1),
  imageSearch: z.boolean().default(false),
  imageSize: z.enum(GOOGLE_IMAGE_SIZES).default('1K'),
  includeThoughts: z.boolean().default(false),
  thinkingLevel: z.enum(['minimal', 'high']).optional(),
  webSearch: z.boolean().default(false),
})

export const VolcengineSeedreamParamsSchema = z.object({
  count: z.number().int().min(1).max(16).default(1),
  maxImages: z.number().int().min(1).max(16).optional(),
  optimizePrompt: z.boolean().default(false),
  outputFormat: z.enum(['png', 'jpeg']).optional(),
  sequentialImageGeneration: z.enum(['auto', 'disabled']).optional(),
  size: z.enum(VOLCENGINE_SEEDREAM_5_SIZES).or(z.enum(VOLCENGINE_SEEDREAM_4_5_SIZES)).or(z.string().regex(/^\d+x\d+$/)).default('2048x2048'),
  watermark: z.boolean().optional(),
  webSearch: z.boolean().default(false),
})

export type GoogleGeminiImageParams = z.infer<typeof GoogleGeminiImageParamsSchema>
export type VolcengineSeedreamParams = z.infer<typeof VolcengineSeedreamParamsSchema>
