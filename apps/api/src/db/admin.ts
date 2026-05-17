import { apiEnv } from '../config/env'
import { DEFAULT_DATABASE_URL } from '../config/defaults'
import { normalizePostgresUrl } from './database-url'

export const quoteIdentifier = (value: string): string => `"${value.replaceAll('"', '""')}"`

export const getDatabaseUrl = (): string => apiEnv.databaseUrl ?? DEFAULT_DATABASE_URL

export const getDatabaseName = (databaseUrl = getDatabaseUrl()): string => {
  const name = new URL(normalizePostgresUrl(databaseUrl)).pathname.slice(1)
  if (!name) {
    throw new Error('Database URL must include a database name.')
  }
  return name
}

export const getAdminDatabaseUrl = (databaseUrl = getDatabaseUrl()): string => {
  const url = new URL(normalizePostgresUrl(databaseUrl))
  url.pathname = '/postgres'
  url.search = ''
  return url.toString()
}
