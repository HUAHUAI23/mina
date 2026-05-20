import { createEnv } from '@t3-oss/env-core'
import { z } from 'zod'

const normalizeBaseUrl = (value: string | undefined): string => {
  const trimmed = value?.trim()

  if (!trimmed || trimmed === '/') {
    return '/'
  }

  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
}

const env = createEnv({
  clientPrefix: 'VITE_',
  client: {
    VITE_API_BASE_URL: z.string().default('/').transform(normalizeBaseUrl),
    VITE_WORKFLOW_CANVAS_SYNC_MODE: z.enum(['primary', 'shadow', 'disabled']).default('primary'),
  },
  runtimeEnvStrict: {
    VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL,
    VITE_WORKFLOW_CANVAS_SYNC_MODE: import.meta.env.VITE_WORKFLOW_CANVAS_SYNC_MODE,
  },
  emptyStringAsUndefined: true,
})

export const webEnv = {
  apiBaseUrl: env.VITE_API_BASE_URL,
  workflowCanvasSyncMode: env.VITE_WORKFLOW_CANVAS_SYNC_MODE,
} as const
