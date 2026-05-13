import { defineConfig } from 'drizzle-kit'

import { DEFAULT_DATABASE_URL, apiEnv } from './src/config/env'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: apiEnv.databaseUrl ?? DEFAULT_DATABASE_URL,
  },
  strict: true,
  verbose: true,
})
