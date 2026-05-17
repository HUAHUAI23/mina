import './src/config/load-env'

import { defineConfig } from 'drizzle-kit'

import { DEFAULT_DATABASE_URL } from './src/config/defaults'
import { normalizePostgresUrl } from './src/db/database-url'

const databaseUrl = normalizePostgresUrl(process.env.MINA_DATABASE_URL ?? DEFAULT_DATABASE_URL)
const tablesFilter = [
  'accounts',
  'media_objects',
  'pricing_rules',
  'task_events',
  'task_resources',
  'tasks',
  'users',
  'workflow_edges',
  'workflow_nodes',
  'workflow_run_edges',
  'workflow_run_events',
  'workflow_run_node_dependencies',
  'workflow_run_node_states',
  'workflow_run_node_tasks',
  'workflow_run_nodes',
  'workflow_runs',
  'workflows',
]

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  schemaFilter: ['public'],
  tablesFilter,
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
})
