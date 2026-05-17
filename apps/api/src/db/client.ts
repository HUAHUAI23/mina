import { drizzle } from 'drizzle-orm/postgres-js'

import { apiEnv } from '../config/env'

import { normalizePostgresUrl } from './database-url'

export const createDbClient = (databaseUrl = apiEnv.databaseUrl) => {
  if (!databaseUrl) {
    throw new Error('MINA_DATABASE_URL is required to create a PostgreSQL client.')
  }

  return drizzle({ connection: { url: normalizePostgresUrl(databaseUrl), prepare: false } })
}

export type MinaDbClient = ReturnType<typeof createDbClient>
export type MinaDbTransaction = Parameters<Parameters<MinaDbClient['transaction']>[0]>[0]
