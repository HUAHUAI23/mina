import type { CSSProperties, ReactNode } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { AssetFolderWithCount, AssetLibraryItemWithRelations } from '@mina/contracts/modules/assets'
import { formatRelativeTime } from '@mina/i18n'
import {
  FileAudio,
  FileImage,
  FileVideo,
  Heart,
  MoreVertical,
  MoveRight,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react'

import { Button } from '@mina/ui/components/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@mina/ui/components/dropdown-menu'
import { cn } from '@mina/ui/lib/utils'

import type { MinaLocale } from '@mina/i18n'

import type { WebMessages } from '../../../lib/i18n-messages'
import { MediaImage } from '../../../components/media/MediaImage'
import {
  assetDragId,
  assetDropId,
  folderDropId,
  type AssetDragData,
  type AssetDropData,
} from '../domain/asset-board'
import {
  activeDropClassName,
  cardClassName,
  iconButtonClassName,
  overlayClassName,
  thumbnailClassName,
  uploadCardClassName,
} from './asset-library-styles'

const kindIcon = {
  audio: FileAudio,
  image: FileImage,
  video: FileVideo,
} as const

interface AssetPreviewProps {
  asset: AssetLibraryItemWithRelations
  label: string
}

function AssetPreview({ asset, label }: AssetPreviewProps) {
  const Icon = kindIcon[asset.mediaObject.kind]
  const isImage = asset.mediaObject.kind === 'image'

  return (
    <div className={thumbnailClassName} aria-label={label}>
      {isImage ? (
        <MediaImage
          alt=""
          className="size-full object-cover"
          decoding="async"
          fallback={(
            <>
              <div className="absolute inset-0 bg-linear-to-br from-surface-container-lowest via-surface-container-low to-surface-container-high" />
              <div className="absolute inset-0 grid place-items-center text-brand-accent">
                <Icon aria-hidden="true" size={34} />
              </div>
            </>
          )}
          loading="lazy"
          source={{ type: 'media', media: { mediaObjectId: asset.mediaObjectId, url: asset.mediaObject.url } }}
        />
      ) : (
        <div className="absolute inset-0 bg-linear-to-br from-surface-container-lowest via-surface-container-low to-surface-container-high" />
      )}
      {!isImage ? (
        <div className="absolute inset-0 grid place-items-center text-brand-accent">
          <Icon aria-hidden="true" size={34} />
        </div>
      ) : null}
    </div>
  )
}

interface UploadAssetCardProps {
  disabled: boolean
  m: WebMessages
  onClick(): void
}

export function UploadAssetCard({ disabled, m, onClick }: UploadAssetCardProps) {
  return (
    <button className={uploadCardClassName} disabled={disabled} onClick={onClick} type="button">
      <div className="relative h-[10.75rem] overflow-hidden rounded-md border border-dashed border-outline-ghost bg-surface-container-low/35 p-4 transition-colors group-hover:border-brand-accent/35 group-hover:bg-surface-container-lowest">
        <div className="absolute inset-4 rounded-md border border-dashed border-outline-ghost bg-surface-container-lowest/50 transition-colors group-hover:border-brand-accent/25" />
        <div className="absolute inset-0 grid place-items-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-surface-container-lowest text-brand-accent shadow-floating ring-1 ring-outline-ghost ring-inset transition-colors group-hover:bg-brand-accent group-hover:text-primary-foreground">
            <Upload aria-hidden="true" size={24} />
          </span>
        </div>
      </div>
      <span className="mt-3 block px-1 text-xs font-bold text-foreground-tertiary group-hover:text-brand-accent">{m.assets_upload()}</span>
    </button>
  )
}

interface FolderCardProps {
  folder: AssetFolderWithCount
  isOver?: boolean
  m: WebMessages
  mutationPending: boolean
  overlay?: boolean
  onDelete(folderId: string): void
  onOpen(folder: AssetFolderWithCount): void
  onRename(folder: AssetFolderWithCount): void
}

export function FolderCard({ folder, isOver = false, m, mutationPending, onDelete, onOpen, onRename, overlay = false }: FolderCardProps) {
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    data: {
      type: 'folder',
      folder,
    } satisfies AssetDropData,
    disabled: overlay || mutationPending,
    id: folderDropId(folder.id),
  })

  return (
    <article className={cn(cardClassName, isOver && activeDropClassName, overlay && overlayClassName)} ref={overlay ? undefined : setDroppableNodeRef}>
      <button
        aria-label={m.assets_open_folder({ name: folder.name })}
        className="block w-full rounded-md text-left focus-visible:ring-2 focus-visible:ring-brand-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface-container-lowest focus-visible:outline-none"
        onClick={() => onOpen(folder)}
        type="button"
      >
        <div className={thumbnailClassName}>
          <div className="absolute inset-0 bg-linear-to-br from-surface-container-lowest via-surface-container-low to-surface-container-high" />
          <div className="absolute left-6 top-8 h-20 w-32 rounded-md bg-surface-container-lowest ring-1 ring-outline-ghost ring-inset" />
          <div className="absolute left-6 top-5 h-10 w-20 rounded-t-md bg-brand-accent/18 ring-1 ring-brand-accent/10 ring-inset" />
          <span className="absolute bottom-5 left-5 rounded-full bg-surface-container-lowest px-3 py-1 text-xs font-bold text-foreground-secondary ring-1 ring-outline-ghost ring-inset">
            {m.assets_folder_count({ count: folder.assetCount })}
          </span>
        </div>
      </button>
      <div className="mt-3 flex min-w-0 items-start justify-between gap-2 px-1">
        <button className="grid min-w-0 gap-1 text-left" onClick={() => onOpen(folder)} type="button">
          <h3 className="font-display m-0 truncate text-base leading-tight font-semibold text-foreground">{folder.name}</h3>
          <p className="m-0 truncate text-sm font-semibold text-foreground-secondary">{m.assets_folder()}</p>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button aria-label={m.assets_more_actions({ title: folder.name })} className={iconButtonClassName} size="icon-sm" type="button" variant="ghost">
              <MoreVertical aria-hidden="true" size={18} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem disabled={mutationPending} onClick={() => onRename(folder)}>
              <Pencil aria-hidden="true" size={15} />
              {m.assets_rename_folder()}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={mutationPending} onClick={() => onDelete(folder.id)} variant="destructive">
              <Trash2 aria-hidden="true" size={15} />
              {m.assets_delete_folder()}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </article>
  )
}

interface AssetCardProps {
  actionSlot?: ReactNode
  asset: AssetLibraryItemWithRelations
  isOver?: boolean
  locale: MinaLocale
  m: WebMessages
  mutationPending: boolean
  overlay?: boolean
  onDelete(asset: AssetLibraryItemWithRelations): void
  onMove(asset: AssetLibraryItemWithRelations): void
  onToggleFavorite(asset: AssetLibraryItemWithRelations): void
}

export function AssetCard({ actionSlot, asset, isOver = false, locale, m, mutationPending, onDelete, onMove, onToggleFavorite, overlay = false }: AssetCardProps) {
  const { setNodeRef: setDroppableNodeRef } = useDroppable({
    data: {
      type: 'asset',
      asset,
    } satisfies AssetDropData,
    disabled: overlay || mutationPending,
    id: assetDropId(asset.id),
  })

  return (
    <article className={cn(cardClassName, isOver && activeDropClassName, overlay && overlayClassName)} ref={overlay ? undefined : setDroppableNodeRef}>
      <div className="block w-full rounded-md text-left">
        <AssetPreview asset={asset} label={m.assets_preview_label({ title: asset.displayName })} />
      </div>
      <div className="mt-3 flex min-w-0 items-start justify-between gap-2 px-1">
        <div className="grid min-w-0 gap-1 text-left">
          <h3 className="font-display m-0 truncate text-base leading-tight font-semibold text-foreground">{asset.displayName}</h3>
          <p className="m-0 truncate text-sm font-semibold text-foreground-secondary">
            {asset.folder?.name ?? m.assets_unfiled()} · {formatRelativeTime(asset.updatedAt, locale)}
          </p>
          {asset.tags.length > 0 ? (
            <div className="mt-1 flex min-w-0 flex-wrap gap-1.5">
              {asset.tags.slice(0, 3).map((tag) => (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-foreground-secondary" key={tag.id}>{tag.name}</span>
              ))}
            </div>
          ) : null}
        </div>
        {overlay ? null : actionSlot ?? (
          <AssetActions
            asset={asset}
            m={m}
            mutationPending={mutationPending}
            onDelete={onDelete}
            onMove={onMove}
            onToggleFavorite={onToggleFavorite}
          />
        )}
      </div>
    </article>
  )
}

interface AssetActionsProps {
  asset: AssetLibraryItemWithRelations
  m: WebMessages
  mutationPending: boolean
  onDelete(asset: AssetLibraryItemWithRelations): void
  onMove(asset: AssetLibraryItemWithRelations): void
  onToggleFavorite(asset: AssetLibraryItemWithRelations): void
}

function AssetActions({ asset, m, mutationPending, onDelete, onMove, onToggleFavorite }: AssetActionsProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label={m.assets_more_actions({ title: asset.displayName })} className={iconButtonClassName} size="icon-sm" type="button" variant="ghost">
          <MoreVertical aria-hidden="true" size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem disabled={mutationPending} onClick={() => onToggleFavorite(asset)}>
          <Heart aria-hidden="true" size={15} />
          {asset.favoritedAt ? m.assets_unfavorite() : m.assets_favorite()}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={mutationPending} onClick={() => onMove(asset)}>
          <MoveRight aria-hidden="true" size={15} />
          {m.assets_move_to_folder()}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={mutationPending} onClick={() => onDelete(asset)} variant="destructive">
          <Trash2 aria-hidden="true" size={15} />
          {m.assets_delete_asset()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

interface DraggableAssetCardProps extends Omit<AssetCardProps, 'actionSlot' | 'overlay'> {
  disabled?: boolean
}

export function DraggableAssetCard({ disabled = false, ...props }: DraggableAssetCardProps) {
  const { attributes, isDragging, listeners, setNodeRef, transform } = useDraggable({
    data: {
      type: 'asset',
      asset: props.asset,
    } satisfies AssetDragData,
    disabled,
    id: assetDragId(props.asset.id),
  })
  const style = {
    transform: CSS.Translate.toString(transform),
  } satisfies CSSProperties

  return (
    <div
      className={cn('min-w-0 cursor-grab active:cursor-grabbing', isDragging && 'relative z-20')}
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <AssetCard
        {...props}
        actionSlot={(
          <div
            onKeyDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <AssetActions
              asset={props.asset}
              m={props.m}
              mutationPending={props.mutationPending}
              onDelete={props.onDelete}
              onMove={props.onMove}
              onToggleFavorite={props.onToggleFavorite}
            />
          </div>
        )}
      />
    </div>
  )
}
