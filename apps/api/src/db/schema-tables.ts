import { getTableName, isTable } from 'drizzle-orm'

import * as schema from './schema'

export const minaTableNames = Object.values(schema)
  .filter(isTable)
  .map((table) => getTableName(table))
  .sort()
