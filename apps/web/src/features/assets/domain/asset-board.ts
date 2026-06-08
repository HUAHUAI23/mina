import type { AssetFolderWithCount, AssetLibraryItemWithRelations } from '@mina/contracts/modules/assets'

export type AssetBoardIdentifier = string | number

export type AssetDragData = {
  type: 'asset'
  asset: AssetLibraryItemWithRelations
}

export type AssetDropData =
  | {
      type: 'folder'
      folder: AssetFolderWithCount
    }
  | {
      type: 'asset'
      asset: AssetLibraryItemWithRelations
    }

export const assetDragId = (assetId: string): string => `asset:${assetId}`

export const assetDropId = (assetId: string): string => `asset-drop:${assetId}`

export const folderDropId = (folderId: string): string => `asset-folder:${folderId}`

export const assetIdFromIdentifier = (assetId: AssetBoardIdentifier): string => {
  const parts = String(assetId).split(':')
  if (parts[0] === 'asset') {
    return parts[parts.length - 1] ?? String(assetId)
  }
  return String(assetId)
}

export const assetDragDataFromUnknown = (value: unknown): AssetDragData | undefined => {
  if (!value || typeof value !== 'object' || !('type' in value) || value.type !== 'asset' || !('asset' in value)) {
    return undefined
  }
  return value as AssetDragData
}

export const assetDropDataFromUnknown = (value: unknown): AssetDropData | undefined => {
  if (!value || typeof value !== 'object' || !('type' in value)) {
    return undefined
  }
  if (value.type === 'folder' && 'folder' in value) {
    return value as AssetDropData
  }
  if (value.type === 'asset' && 'asset' in value) {
    return value as AssetDropData
  }
  return undefined
}

export const defaultAssetFolderName = (
  source: AssetLibraryItemWithRelations,
  target: AssetLibraryItemWithRelations,
): string => `${target.displayName} + ${source.displayName}`.slice(0, 120)
