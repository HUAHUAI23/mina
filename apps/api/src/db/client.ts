import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { apiEnv } from '../config/env'

import * as schema from './schema'

export const createDbClient = (databaseUrl = apiEnv.databaseUrl) => {
  if (!databaseUrl) {
    throw new Error('MINA_DATABASE_URL is required to create a PostgreSQL client.')
  }

  const client = postgres(databaseUrl, { prepare: false })
  return drizzle(client, { schema })
}
