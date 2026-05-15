export const parseJsonStringMap = (value: string | undefined): Map<string, string> => {
  if (!value?.trim()) {
    return new Map()
  }
  const parsed = JSON.parse(value) as unknown
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return new Map()
  }
  return new Map(
    Object.entries(parsed as Record<string, unknown>).flatMap(([key, rawValue]) =>
      typeof rawValue === 'string' && key.trim() && rawValue.trim() ? [[key.trim(), rawValue.trim()]] : [],
    ),
  )
}

export const resolveAlias = (aliases: Map<string, string>, model: string): string => aliases.get(model) ?? model
