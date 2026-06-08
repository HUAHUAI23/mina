import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { DragCancelEvent, DragEndEvent, DragOverEvent, DragStartEvent, UniqueIdentifier } from '@dnd-kit/core'
import type {
  AssetFolderWithCount,
  AssetLibraryItemWithRelations,
  AssetLibrarySourceType,
  AssetTag,
  ListAssetLibraryItemsQuery,
} from '@mina/contracts/modules/assets'
import type { ResourceKind } from '@mina/contracts/modules/tasks'

import {
  createAssetFolder,
  createAssetFolderWithItems,
  deleteAsset,
  deleteAssetFolder,
  listAssetFolders,
  listAssets,
  listAssetTags,
  updateAssetFolder,
  updateAsset,
  uploadAsset,
  type UploadAssetInput,
} from '../api/assets.client'
import { assetKeys } from '../api/asset-keys'
import {
  assetIdFromIdentifier,
  assetDragDataFromUnknown,
  assetDropDataFromUnknown,
  defaultAssetFolderName,
} from '../domain/asset-board'

export type AssetNamingState =
  | {
      kind: 'create-folder'
      name: string
    }
  | {
      folder: AssetFolderWithCount
      kind: 'rename-folder'
      name: string
    }
  | {
      kind: 'create-folder-from-assets'
      name: string
      source: AssetLibraryItemWithRelations
      target: AssetLibraryItemWithRelations
    }

export interface AssetUploadState {
  description: string
  displayName: string
  file: File | null
  folderId: string | undefined
  tagIds: string[]
}

export interface AssetMoveState {
  asset: AssetLibraryItemWithRelations
  folderId: string | undefined
  folderQuery: string
}

const toggleValue = (values: string[], value: string): string[] =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value]

export const useAssetLibraryController = () => {
  const queryClient = useQueryClient()
  const [queryText, setQueryText] = useState('')
  const [selectedFolderId, setSelectedFolderId] = useState<string | undefined>()
  const [selectedFolder, setSelectedFolder] = useState<AssetFolderWithCount | undefined>()
  const [selectedKind, setSelectedKind] = useState<ResourceKind | undefined>()
  const [selectedSourceProjectId, setSelectedSourceProjectId] = useState<string | undefined>()
  const [selectedSourceType, setSelectedSourceType] = useState<AssetLibrarySourceType | undefined>()
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [foldersOnly, setFoldersOnly] = useState(false)
  const [activeAssetId, setActiveAssetId] = useState<UniqueIdentifier | null>(null)
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null)
  const [namingState, setNamingState] = useState<AssetNamingState | null>(null)
  const [uploadState, setUploadState] = useState<AssetUploadState | null>(null)
  const [moveState, setMoveState] = useState<AssetMoveState | null>(null)

  const assetQueryInput = useMemo<ListAssetLibraryItemsQuery>(
    () => ({
      favoriteOnly,
      folderId: selectedFolderId,
      kind: selectedKind,
      limit: 60,
      q: queryText.trim() || undefined,
      sort: queryText.trim() ? 'relevance' : 'recent',
      sourceProjectId: selectedSourceProjectId,
      sourceType: selectedSourceType,
      tagIds: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      tagMatch: 'all',
    }),
    [favoriteOnly, queryText, selectedFolderId, selectedKind, selectedSourceProjectId, selectedSourceType, selectedTagIds],
  )
  const assetsQuery = useQuery({
    queryFn: () => listAssets(assetQueryInput),
    queryKey: assetKeys.library(assetQueryInput),
  })
  const foldersQuery = useQuery({
    queryFn: listAssetFolders,
    queryKey: assetKeys.folders(),
  })
  const sourceProjectsQuery = useQuery({
    queryFn: () => listAssets({ limit: 100, sort: 'recent', tagMatch: 'all' }),
    queryKey: assetKeys.sourceProjects(),
  })
  const tagsQuery = useQuery({
    queryFn: listAssetTags,
    queryKey: assetKeys.tags(),
  })
  const folders = assetsQuery.data?.folders ?? []
  const allFolders = foldersQuery.data?.items ?? folders
  const items = assetsQuery.data?.items ?? []
  const tags = tagsQuery.data?.items ?? []
  const activeAsset = activeAssetId ? items.find((asset) => asset.id === assetIdFromIdentifier(activeAssetId)) : undefined
  const sourceProjects = useMemo(
    () => Array.from(
      new Map(
        (sourceProjectsQuery.data?.items ?? items)
          .filter((item) => item.sourceProjectId || item.sourceProjectName)
          .map((item) => [
            item.sourceProjectId ?? item.sourceProjectName ?? '',
            {
              id: item.sourceProjectId ?? item.sourceProjectName ?? '',
              name: item.sourceProjectName ?? item.sourceProjectId ?? '',
            },
          ]),
      ).values(),
    ).filter((project) => project.id && project.name),
    [items, sourceProjectsQuery.data?.items],
  )

  const invalidateAssets = () => {
    void queryClient.invalidateQueries({ queryKey: assetKeys.all })
  }

  const resetAssetFilters = () => {
    setQueryText('')
    setSelectedKind(undefined)
    setSelectedSourceProjectId(undefined)
    setSelectedSourceType(undefined)
    setSelectedTagIds([])
    setFavoriteOnly(false)
    setFoldersOnly(false)
  }

  const showUploadedAsset = (asset: AssetLibraryItemWithRelations) => {
    setSelectedFolderId(asset.folderId)
    setSelectedFolder(undefined)
    resetAssetFilters()
  }

  const createFolderMutation = useMutation({
    mutationFn: (name: string) => createAssetFolder({ name }),
    onSuccess: (response) => {
      setNamingState(null)
      if (selectedFolderId === response.item.id) {
        setSelectedFolder(response.item)
      }
      invalidateAssets()
    },
  })
  const renameFolderMutation = useMutation({
    mutationFn: (input: { folderId: string; name: string }) => updateAssetFolder(input.folderId, { name: input.name }),
    onSuccess: () => {
      setNamingState(null)
      invalidateAssets()
    },
  })
  const createMoveFolderMutation = useMutation({
    mutationFn: (name: string) => createAssetFolder({ name }),
    onSuccess: (response) => {
      setMoveState((state) => state ? { ...state, folderId: response.item.id, folderQuery: '' } : state)
      invalidateAssets()
    },
  })
  const createFolderWithAssetsMutation = useMutation({
    mutationFn: (input: { name: string; source: AssetLibraryItemWithRelations; target: AssetLibraryItemWithRelations }) =>
      createAssetFolderWithItems({ assetItemIds: [input.source.id, input.target.id], name: input.name }),
    onSuccess: (response) => {
      setNamingState(null)
      setSelectedFolder(response.item)
      setSelectedFolderId(response.item.id)
      setFoldersOnly(false)
      invalidateAssets()
    },
  })
  const uploadMutation = useMutation({
    mutationFn: (input: UploadAssetInput) => uploadAsset(input),
    onSuccess: (response) => {
      setUploadState(null)
      showUploadedAsset(response.item)
      invalidateAssets()
    },
  })
  const updateAssetMutation = useMutation({
    mutationFn: (input: { assetId: string; description?: string | null; displayName?: string; folderId?: string | null; favorited?: boolean; tagIds?: string[] }) =>
      updateAsset(input.assetId, {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.folderId !== undefined ? { folderId: input.folderId } : {}),
        ...(input.favorited !== undefined ? { favorited: input.favorited } : {}),
        ...(input.tagIds ? { tagIds: input.tagIds } : {}),
      }),
    onSuccess: () => {
      setMoveState(null)
      invalidateAssets()
    },
  })
  const deleteAssetMutation = useMutation({
    mutationFn: (assetId: string) => deleteAsset(assetId),
    onSuccess: invalidateAssets,
  })
  const deleteFolderMutation = useMutation({
    mutationFn: (folderId: string) => deleteAssetFolder(folderId),
    onSuccess: () => {
      setSelectedFolder(undefined)
      setSelectedFolderId(undefined)
      invalidateAssets()
    },
  })

  const mutationError =
    createFolderMutation.error ??
    renameFolderMutation.error ??
    createMoveFolderMutation.error ??
    createFolderWithAssetsMutation.error ??
    uploadMutation.error ??
    updateAssetMutation.error ??
    deleteAssetMutation.error ??
    deleteFolderMutation.error
  const mutationPending =
    createFolderMutation.isPending ||
    renameFolderMutation.isPending ||
    createMoveFolderMutation.isPending ||
    createFolderWithAssetsMutation.isPending ||
    uploadMutation.isPending ||
    updateAssetMutation.isPending ||
    deleteAssetMutation.isPending ||
    deleteFolderMutation.isPending

  const resetMutations = () => {
    createFolderMutation.reset()
    renameFolderMutation.reset()
    createMoveFolderMutation.reset()
    createFolderWithAssetsMutation.reset()
    uploadMutation.reset()
    updateAssetMutation.reset()
    deleteAssetMutation.reset()
    deleteFolderMutation.reset()
  }

  const submitNaming = () => {
    if (!namingState || mutationPending) return
    const name = namingState.name.trim()
    if (!name) return
    if (namingState.kind === 'rename-folder') {
      renameFolderMutation.mutate({ folderId: namingState.folder.id, name })
      return
    }
    if (namingState.kind === 'create-folder-from-assets') {
      createFolderWithAssetsMutation.mutate({
        name,
        source: namingState.source,
        target: namingState.target,
      })
      return
    }
    createFolderMutation.mutate(name)
  }

  const submitUpload = () => {
    if (!uploadState?.file || mutationPending) return
    const input: UploadAssetInput = {
      description: uploadState.description,
      displayName: uploadState.displayName,
      file: uploadState.file,
      tagIds: uploadState.tagIds,
    }
    if (uploadState.folderId) {
      input.folderId = uploadState.folderId
    }
    uploadMutation.mutate(input)
  }

  const submitMove = () => {
    if (!moveState || mutationPending) return
    updateAssetMutation.mutate({
      assetId: moveState.asset.id,
      folderId: moveState.folderId ?? null,
    })
  }

  const createFolderForMove = () => {
    const name = moveState?.folderQuery.trim()
    if (!name || mutationPending) return
    createMoveFolderMutation.mutate(name)
  }

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveAssetId(active.id)
  }

  const handleDragOver = ({ over }: DragOverEvent) => {
    setOverId(over?.id ?? null)
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    setActiveAssetId(null)
    setOverId(null)
    const source = assetDragDataFromUnknown(active.data.current)?.asset
    const drop = assetDropDataFromUnknown(over?.data.current)
    if (!source || !drop || mutationPending) {
      return
    }
    if (drop.type === 'folder') {
      if (source.folderId === drop.folder.id) {
        return
      }
      updateAssetMutation.mutate({ assetId: source.id, folderId: drop.folder.id })
      return
    }
    if (source.id === drop.asset.id) {
      return
    }
    setNamingState({
      kind: 'create-folder-from-assets',
      name: defaultAssetFolderName(source, drop.asset),
      source,
      target: drop.asset,
    })
  }

  const handleDragCancel = (_event?: DragCancelEvent) => {
    setActiveAssetId(null)
    setOverId(null)
  }

  return {
    activeAsset,
    activeAssetId,
    assetsQuery,
    allFolders,
    favoriteOnly,
    foldersOnly,
    foldersQuery,
    folders,
    items,
    moveState,
    mutationError,
    mutationPending,
    namingState,
    overId,
    queryText,
    selectedFolderId,
    selectedFolder,
    selectedKind,
    selectedSourceProjectId,
    selectedSourceType,
    selectedTagIds,
    sourceProjects,
    tags,
    tagsQuery,
    uploadState,
    clearFolder: () => {
      setSelectedFolder(undefined)
      setSelectedFolderId(undefined)
    },
    clearFilters: () => {
      resetMutations()
      resetAssetFilters()
    },
    closeMoveDialog: () => {
      resetMutations()
      setMoveState(null)
    },
    closeNamingDialog: () => {
      resetMutations()
      setNamingState(null)
    },
    closeUploadDialog: () => {
      resetMutations()
      setUploadState(null)
    },
    deleteAsset: (asset: AssetLibraryItemWithRelations) => deleteAssetMutation.mutate(asset.id),
    deleteFolder: (folderId: string) => deleteFolderMutation.mutate(folderId),
    createFolderForMove,
    handleDragCancel,
    handleDragEnd,
    handleDragOver,
    handleDragStart,
    openFolder: (folder: AssetFolderWithCount) => {
      setSelectedFolder(folder)
      setSelectedFolderId(folder.id)
      resetAssetFilters()
    },
    openCreateFolderDialog: () => {
      resetMutations()
      setNamingState({ kind: 'create-folder', name: '' })
    },
    openMoveDialog: (asset: AssetLibraryItemWithRelations) => {
      resetMutations()
      setMoveState({ asset, folderId: asset.folderId, folderQuery: '' })
    },
    openRenameFolderDialog: (folder: AssetFolderWithCount) => {
      resetMutations()
      setNamingState({ folder, kind: 'rename-folder', name: folder.name })
    },
    openUploadDialog: () => {
      resetMutations()
      setUploadState({
        description: '',
        displayName: '',
        file: null,
        folderId: selectedFolderId,
        tagIds: [],
      })
    },
    setFavoriteOnly,
    setFoldersOnly,
    setMoveFolderId: (folderId: string | undefined) => setMoveState((state) => state ? { ...state, folderId } : state),
    setMoveFolderQuery: (folderQuery: string) => setMoveState((state) => state ? { ...state, folderQuery } : state),
    setNamingName: (name: string) => setNamingState((state) => state ? { ...state, name } : state),
    setQueryText,
    setSelectedFolderId: (folderId: string | undefined) => {
      setSelectedFolder(undefined)
      setSelectedFolderId(folderId)
    },
    setSelectedKind,
    setSelectedSourceProjectId,
    setSelectedSourceType,
    setUploadDescription: (description: string) => setUploadState((state) => state ? { ...state, description } : state),
    setUploadDisplayName: (displayName: string) => setUploadState((state) => state ? { ...state, displayName } : state),
    setUploadFile: (file: File | null) => setUploadState((state) => {
      if (!state) return state
      const displayName = file && !state.displayName.trim()
        ? file.name
        : !file && state.file && state.displayName === state.file.name
          ? ''
          : state.displayName
      return { ...state, displayName, file }
    }),
    setUploadFolderId: (folderId: string | undefined) => setUploadState((state) => state ? { ...state, folderId } : state),
    toggleAssetFavorite: (asset: AssetLibraryItemWithRelations) =>
      updateAssetMutation.mutate({ assetId: asset.id, favorited: !asset.favoritedAt }),
    toggleSelectedTag: (tag: AssetTag) => setSelectedTagIds((values) => toggleValue(values, tag.id)),
    toggleUploadTag: (tag: AssetTag) => setUploadState((state) => state ? { ...state, tagIds: toggleValue(state.tagIds, tag.id) } : state),
    submitMove,
    submitNaming,
    submitUpload,
  }
}
