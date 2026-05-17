import postgres from 'postgres'

import { getAdminDatabaseUrl, getDatabaseName, quoteIdentifier } from '../../src/db/admin'

const databaseName = getDatabaseName()
const admin = postgres(getAdminDatabaseUrl(), { max: 1, prepare: false })

try {
  const existing = await admin`SELECT 1 FROM pg_database WHERE datname = ${databaseName}`
  if (existing.length === 0) {
    console.log(`Database ${databaseName} does not exist.`)
  } else {
    await admin.unsafe(`DROP DATABASE ${quoteIdentifier(databaseName)} WITH (FORCE)`)
    console.log(`Dropped database ${databaseName}.`)
  }
} finally {
  await admin.end({ timeout: 1 })
}
