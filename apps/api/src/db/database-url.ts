const POSTGRES_JS_IGNORED_SEARCH_PARAMS = new Set(['directConnection'])

export const normalizePostgresUrl = (databaseUrl: string): string => {
  const url = new URL(databaseUrl)

  for (const key of POSTGRES_JS_IGNORED_SEARCH_PARAMS) {
    url.searchParams.delete(key)
  }

  return url.toString()
}
