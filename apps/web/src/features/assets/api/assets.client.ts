import type {
  AssetFolderListResponse,
  AssetFolderResponse,
  AssetLibraryItemResponse,
  AssetLibraryListResponse,
  AssetTagListResponse,
  CreateAssetFolderInput,
  CreateAssetFolderWithItemsInput,
  CreateAssetTagInput,
  DeleteAssetResponse,
  ListAssetLibraryItemsQuery,
  UpdateAssetFolderInput,
  UpdateAssetLibraryItemInput,
  UpdateAssetTagInput,
} from '@mina/contracts/modules/assets'
import {
  AssetFolderListResponseSchema,
  AssetFolderResponseSchema,
  AssetLibraryItemResponseSchema,
  AssetLibraryListResponseSchema,
  AssetTagListResponseSchema,
  AssetTagResponseSchema,
  DeleteAssetResponseSchema,
} from '@mina/contracts/modules/assets'

import { apiClient } from '../../../lib/api-client'
import { readJson } from '../../../lib/http'

export interface UploadAssetInput {
  description?: string
  displayName?: string
  file: File
  folderId?: string
  tagIds: string[]
}

const compactQuery = (query: ListAssetLibraryItemsQuery): ListAssetLibraryItemsQuery =>
  Object.fromEntries(
    Object.entries(query).filter(([, value]) => value !== undefined && value !== '' && value !== false),
  ) as ListAssetLibraryItemsQuery

export const listAssets = async (query: ListAssetLibraryItemsQuery): Promise<AssetLibraryListResponse> => {
  const response = await apiClient.api.assets.$get({ query: compactQuery(query) })
  return readJson(response, AssetLibraryListResponseSchema)
}

export const uploadAsset = async (input: UploadAssetInput): Promise<AssetLibraryItemResponse> => {
  const form = {
    file: input.file,
    ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
    ...(input.description?.trim() ? { description: input.description.trim() } : {}),
    ...(input.folderId ? { folderId: input.folderId } : {}),
    ...(input.tagIds.length > 0 ? { tagIds: input.tagIds } : {}),
  }
  const response = await apiClient.api.assets.upload.$post({ form })
  return readJson(response, AssetLibraryItemResponseSchema)
}

export const updateAsset = async (
  assetId: string,
  input: UpdateAssetLibraryItemInput,
): Promise<AssetLibraryItemResponse> => {
  const response = await apiClient.api.assets[':id'].$patch({
    json: input,
    param: { id: assetId },
  })
  return readJson(response, AssetLibraryItemResponseSchema)
}

export const deleteAsset = async (assetId: string): Promise<DeleteAssetResponse> => {
  const response = await apiClient.api.assets[':id'].$delete({ param: { id: assetId } })
  return readJson(response, DeleteAssetResponseSchema)
}

export const useAsset = async (assetId: string): Promise<AssetLibraryItemResponse> => {
  const response = await apiClient.api.assets[':id'].use.$post({ param: { id: assetId } })
  return readJson(response, AssetLibraryItemResponseSchema)
}

export const listAssetFolders = async (): Promise<AssetFolderListResponse> => {
  const response = await apiClient.api.assets.folders.$get({})
  return readJson(response, AssetFolderListResponseSchema)
}

export const createAssetFolder = async (input: CreateAssetFolderInput): Promise<AssetFolderResponse> => {
  const response = await apiClient.api.assets.folders.$post({ json: input })
  return readJson(response, AssetFolderResponseSchema)
}

export const createAssetFolderWithItems = async (input: CreateAssetFolderWithItemsInput): Promise<AssetFolderResponse> => {
  const response = await apiClient.api.assets.folders['from-items'].$post({ json: input })
  return readJson(response, AssetFolderResponseSchema)
}

export const updateAssetFolder = async (
  folderId: string,
  input: UpdateAssetFolderInput,
): Promise<AssetFolderResponse> => {
  const response = await apiClient.api.assets.folders[':folderId'].$patch({
    json: input,
    param: { folderId },
  })
  return readJson(response, AssetFolderResponseSchema)
}

export const deleteAssetFolder = async (folderId: string): Promise<DeleteAssetResponse> => {
  const response = await apiClient.api.assets.folders[':folderId'].$delete({ param: { folderId } })
  return readJson(response, DeleteAssetResponseSchema)
}

export const listAssetTags = async (): Promise<AssetTagListResponse> => {
  const response = await apiClient.api.assets.tags.$get({})
  return readJson(response, AssetTagListResponseSchema)
}

export const createAssetTag = async (input: CreateAssetTagInput): Promise<AssetTagListResponse['items'][number]> => {
  const response = await apiClient.api.assets.tags.$post({ json: input })
  return (await readJson(response, AssetTagResponseSchema)).item
}

export const updateAssetTag = async (
  tagId: string,
  input: UpdateAssetTagInput,
): Promise<AssetTagListResponse['items'][number]> => {
  const response = await apiClient.api.assets.tags[':tagId'].$patch({
    json: input,
    param: { tagId },
  })
  return (await readJson(response, AssetTagResponseSchema)).item
}
