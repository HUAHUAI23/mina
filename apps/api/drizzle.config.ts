import './src/config/load-env'

import { defineConfig } from 'drizzle-kit'

import { DEFAULT_DATABASE_URL } from './src/config/defaults'
import { normalizePostgresUrl } from './src/db/database-url'
import { minaTableNames } from './src/db/schema-tables'

const databaseUrl = normalizePostgresUrl(process.env.MINA_DATABASE_URL ?? DEFAULT_DATABASE_URL)

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  schemaFilter: ['public'],
  tablesFilter: minaTableNames,
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
})
