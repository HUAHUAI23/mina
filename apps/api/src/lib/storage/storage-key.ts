import type { StorageObjectScope } from './object-storage'

const DEFAULT_ROOT_PREFIX = 'users'
const RESERVED_PATH_SEGMENTS = new Set(['', '.', '..'])

interface AccountStorageKeyInput {
  accountId: string
  objectName: string
  rootPrefix?: string
  scope: StorageObjectScope
}

const encodePathSegment = (segment: string): string => {
  const trimmed = segment.trim()
  if (RESERVED_PATH_SEGMENTS.has(trimmed)) {
    throw new Error('Storage key path segment is empty or reserved.')
  }

  return encodeURIComponent(trimmed)
}

const normalizeObjectName = (objectName: string): string => {
  const segments = objectName.replaceAll('\\', '/').split('/').map(encodePathSegment)
  if (segments.length === 0) {
    throw new Error('Storage object name is required.')
  }
  return segments.join('/')
}

export const buildAccountStorageRoot = (accountId: string, rootPrefix = DEFAULT_ROOT_PREFIX): string =>
  `${encodePathSegment(rootPrefix)}/${encodePathSegment(accountId)}`

export const buildAccountStorageKey = ({
  accountId,
  objectName,
  rootPrefix,
  scope,
}: AccountStorageKeyInput): string =>
  `${buildAccountStorageRoot(accountId, rootPrefix)}/${scope}/${normalizeObjectName(objectName)}`

export const assertAccountStorageKey = (accountId: string, key: string, rootPrefix?: string): void => {
  const expectedPrefix = `${buildAccountStorageRoot(accountId, rootPrefix)}/`
  if (!key.startsWith(expectedPrefix)) {
    throw new Error('Storage object key is outside of the account root.')
  }
}
