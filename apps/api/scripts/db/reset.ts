import postgres from 'postgres'

import { getDatabaseUrl, quoteIdentifier } from '../../src/db/admin'
import { normalizePostgresUrl } from '../../src/db/database-url'
import { minaTableNames } from '../../src/db/schema-tables'

if (minaTableNames.length === 0) {
  throw new Error('No Mina tables were found in the Drizzle schema.')
}

const sql = postgres(normalizePostgresUrl(getDatabaseUrl()), { max: 1, prepare: false })

try {
  const tableList = minaTableNames.map(quoteIdentifier).join(', ')
  await sql.unsafe(`DROP TABLE IF EXISTS ${tableList} CASCADE`)
  console.log(`Dropped ${minaTableNames.length} Mina tables.`)
} finally {
  await sql.end({ timeout: 1 })
}
