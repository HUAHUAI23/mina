import type { ListAssetLibraryItemsQuery } from '@mina/contracts/modules/assets'

export const assetKeys = {
  all: ['assets'] as const,
  folders: () => [...assetKeys.all, 'folders'] as const,
  library: (query: ListAssetLibraryItemsQuery) => [...assetKeys.all, 'library', query] as const,
  sourceProjects: () => [...assetKeys.all, 'source-projects'] as const,
  tags: () => [...assetKeys.all, 'tags'] as const,
}
