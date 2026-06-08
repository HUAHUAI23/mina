import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { ArrowLeft, Folder, Upload } from 'lucide-react'

import { getErrorMessage } from '../../../lib/http'
import { useI18n } from '../../../app/i18n-provider'
import { assetDropId, folderDropId } from '../domain/asset-board'
import { useAssetLibraryController } from '../hooks/use-asset-library-controller'
import { AssetCard, DraggableAssetCard, FolderCard, UploadAssetCard } from './asset-library-cards'
import { NamingDialog, MoveDialog, UploadDialog } from './asset-library-dialogs'
import { AssetLibraryFilters } from './asset-library-filters'
import {
  actionButtonClassName,
  backButtonClassName,
  contentClassName,
  gridClassName,
  headerClassName,
  pageClassName,
  titleClassName,
} from './asset-library-styles'

export function AssetLibraryPage() {
  const { locale, messages: m } = useI18n()
  const controller = useAssetLibraryController()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor),
  )
  const activeFolder = controller.selectedFolder ?? controller.allFolders.find((folder) => folder.id === controller.selectedFolderId)
  const hasFilters = Boolean(
    controller.queryText ||
    controller.selectedKind ||
    controller.selectedSourceProjectId ||
    controller.selectedSourceType ||
    controller.selectedTagIds.length > 0 ||
    controller.favoriteOnly ||
    controller.foldersOnly,
  )

  return (
    <main className={pageClassName}>
      <header className={headerClassName}>
        <div className="flex min-w-0 items-center gap-3">
          {activeFolder ? (
            <button aria-label={m.assets_title()} className={backButtonClassName} onClick={controller.clearFolder} type="button">
              <ArrowLeft aria-hidden="true" size={17} />
            </button>
          ) : null}
          <h1 className={titleClassName}>{activeFolder ? activeFolder.name : m.assets_title()}</h1>
        </div>
        {activeFolder ? null : (
          <div className="flex flex-none items-center gap-2">
            <button className={actionButtonClassName} onClick={controller.openCreateFolderDialog} type="button">
              <Folder aria-hidden="true" size={16} />
              {m.assets_new_folder()}
            </button>
            <button className={actionButtonClassName} onClick={controller.openUploadDialog} type="button">
              <Upload aria-hidden="true" size={16} />
              {m.assets_upload()}
            </button>
          </div>
        )}
      </header>

      <DndContext
        autoScroll={false}
        collisionDetection={closestCenter}
        onDragCancel={controller.handleDragCancel}
        onDragEnd={controller.handleDragEnd}
        onDragOver={controller.handleDragOver}
        onDragStart={controller.handleDragStart}
        sensors={sensors}
      >
        <section className={contentClassName}>
          <AssetLibraryFilters
            favoriteOnly={controller.favoriteOnly}
            foldersOnly={controller.foldersOnly}
            hasFilters={hasFilters}
            m={m}
            onClearFilters={controller.clearFilters}
            onSetFavoriteOnly={controller.setFavoriteOnly}
            onSetFoldersOnly={controller.setFoldersOnly}
            onSetQueryText={controller.setQueryText}
            onSetSelectedKind={controller.setSelectedKind}
            onSetSelectedSourceProjectId={controller.setSelectedSourceProjectId}
            onSetSelectedSourceType={controller.setSelectedSourceType}
            onToggleTag={controller.toggleSelectedTag}
            queryText={controller.queryText}
            selectedKind={controller.selectedKind}
            selectedSourceProjectId={controller.selectedSourceProjectId}
            selectedSourceType={controller.selectedSourceType}
            selectedTagIds={controller.selectedTagIds}
            sourceProjects={controller.sourceProjects}
            tags={controller.tags}
          />

          {controller.mutationError ? (
            <p className="mt-5 rounded-md bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              {getErrorMessage(controller.mutationError, m.assets_mutation_failed())}
            </p>
          ) : null}

          <div className={gridClassName}>
            {controller.folders.map((folder) => (
              <FolderCard
                folder={folder}
                isOver={controller.overId === folderDropId(folder.id)}
                key={folder.id}
                m={m}
                mutationPending={controller.mutationPending}
                onDelete={controller.deleteFolder}
                onOpen={controller.openFolder}
                onRename={controller.openRenameFolderDialog}
              />
            ))}
            {controller.foldersOnly ? null : controller.items.map((asset) => (
              <DraggableAssetCard
                asset={asset}
                disabled={controller.mutationPending}
                isOver={controller.overId === assetDropId(asset.id)}
                key={asset.id}
                locale={locale}
                m={m}
                mutationPending={controller.mutationPending}
                onDelete={controller.deleteAsset}
                onMove={controller.openMoveDialog}
                onToggleFavorite={controller.toggleAssetFavorite}
              />
            ))}
            {!activeFolder && !controller.assetsQuery.isLoading && !controller.foldersOnly ? (
              <UploadAssetCard disabled={controller.mutationPending} m={m} onClick={controller.openUploadDialog} />
            ) : null}
          </div>
        </section>

        <DragOverlay dropAnimation={null}>
          {controller.activeAsset ? (
            <AssetCard
              asset={controller.activeAsset}
              locale={locale}
              m={m}
              mutationPending={controller.mutationPending}
              onDelete={controller.deleteAsset}
              onMove={controller.openMoveDialog}
              onToggleFavorite={controller.toggleAssetFavorite}
              overlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      <NamingDialog
        error={controller.mutationError}
        m={m}
        onChangeName={controller.setNamingName}
        onClose={controller.closeNamingDialog}
        onSubmit={controller.submitNaming}
        pending={controller.mutationPending}
        state={controller.namingState}
      />
      <UploadDialog
        folders={controller.allFolders}
        locale={locale}
        m={m}
        onChangeDescription={controller.setUploadDescription}
        onChangeDisplayName={controller.setUploadDisplayName}
        onChangeFile={controller.setUploadFile}
        onChangeFolder={controller.setUploadFolderId}
        onClose={controller.closeUploadDialog}
        onSubmit={controller.submitUpload}
        onToggleTag={controller.toggleUploadTag}
        pending={controller.mutationPending}
        state={controller.uploadState}
        tags={controller.tags}
      />
      <MoveDialog
        folders={controller.allFolders}
        m={m}
        onChangeFolder={controller.setMoveFolderId}
        onChangeFolderQuery={controller.setMoveFolderQuery}
        onClose={controller.closeMoveDialog}
        onCreateFolder={controller.createFolderForMove}
        onSubmit={controller.submitMove}
        pending={controller.mutationPending}
        state={controller.moveState}
      />
    </main>
  )
}
