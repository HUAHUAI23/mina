import pino from 'pino'

import { apiEnv } from '../../config/env'

export const appLogger = pino({
  level: apiEnv.logLevel,
  base: {
    service: 'mina-api',
  },
})

export type AppLogger = typeof appLogger
