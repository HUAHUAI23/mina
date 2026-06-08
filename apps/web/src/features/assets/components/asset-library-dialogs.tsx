import type { FormEvent } from 'react'
import type { AssetFolderWithCount, AssetTag } from '@mina/contracts/modules/assets'
import { Search } from 'lucide-react'
import type { MinaLocale } from '@mina/i18n'

import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@mina/ui/components/alert-dialog'
import { Button } from '@mina/ui/components/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@mina/ui/components/dialog'
import { Input } from '@mina/ui/components/input'
import { Textarea } from '@mina/ui/components/textarea'
import { cn } from '@mina/ui/lib/utils'

import type { WebMessages } from '../../../lib/i18n-messages'
import { getErrorMessage } from '../../../lib/http'
import type { AssetMoveState, AssetNamingState, AssetUploadState } from '../hooks/use-asset-library-controller'
import { AssetFilePicker } from './asset-file-picker'
import { activeChipClassName, dialogInputClassName, searchClassName } from './asset-library-styles'
import { TagChips } from './asset-library-filters'

interface NamingDialogProps {
  error?: unknown
  m: WebMessages
  pending: boolean
  state: AssetNamingState | null
  onChangeName(name: string): void
  onClose(): void
  onSubmit(): void
}

export function NamingDialog({ error, m, onChangeName, onClose, onSubmit, pending, state }: NamingDialogProps) {
  const copy = state
    ? state.kind === 'rename-folder'
      ? {
          description: m.assets_rename_folder_description(),
          submit: m.assets_save(),
          title: m.assets_rename_folder(),
        }
      : {
          description: m.assets_name_folder_description(),
          submit: m.assets_create(),
          title: m.assets_name_folder_title(),
        }
    : undefined

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => {
      if (!open && !pending) onClose()
    }}>
      <DialogContent className="bg-surface-container-lowest">
        {state && copy ? (
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>{copy.title}</DialogTitle>
              <DialogDescription>{copy.description}</DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              className={dialogInputClassName}
              maxLength={120}
              onChange={(event) => onChangeName(event.target.value)}
              required
              value={state.name}
            />
            {error ? (
              <p className="m-0 text-xs font-bold text-destructive" role="status">
                {getErrorMessage(error, m.assets_mutation_failed())}
              </p>
            ) : null}
            <DialogFooter>
              <Button disabled={pending} onClick={onClose} type="button" variant="outline">
                {m.assets_cancel()}
              </Button>
              <Button disabled={pending || state.name.trim().length === 0} type="submit">
                {copy.submit}
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

interface UploadDialogProps {
  folders: AssetFolderWithCount[]
  locale: MinaLocale
  m: WebMessages
  pending: boolean
  state: AssetUploadState | null
  tags: AssetTag[]
  onChangeDescription(value: string): void
  onChangeDisplayName(value: string): void
  onChangeFile(file: File | null): void
  onChangeFolder(folderId: string | undefined): void
  onClose(): void
  onSubmit(): void
  onToggleTag(tag: AssetTag): void
}

export function UploadDialog({
  folders,
  locale,
  m,
  onChangeDescription,
  onChangeDisplayName,
  onChangeFile,
  onChangeFolder,
  onClose,
  onSubmit,
  onToggleTag,
  pending,
  state,
  tags,
}: UploadDialogProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <Dialog open={Boolean(state)} onOpenChange={(open) => {
      if (!open && !pending) onClose()
    }}>
      <DialogContent className="sm:max-w-2xl">
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{m.assets_upload()}</DialogTitle>
            <DialogDescription>{m.assets_upload_dialog_description()}</DialogDescription>
          </DialogHeader>
          <AssetFilePicker file={state?.file} locale={locale} m={m} onChangeFile={onChangeFile} pending={pending} />
          <Input className={dialogInputClassName} onChange={(event) => onChangeDisplayName(event.target.value)} placeholder={m.assets_display_name()} value={state?.displayName ?? ''} />
          <Textarea className="min-h-24 bg-surface-container-lowest" onChange={(event) => onChangeDescription(event.target.value)} placeholder={m.assets_description()} value={state?.description ?? ''} />
          <select
            className="h-10 rounded-md border border-outline-ghost bg-surface-container-lowest px-3 text-sm font-semibold text-foreground"
            onChange={(event) => onChangeFolder(event.target.value || undefined)}
            value={state?.folderId ?? ''}
          >
            <option value="">{m.assets_no_folder_option()}</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <TagChips activeIds={state?.tagIds ?? []} m={m} onToggle={onToggleTag} tags={tags} />
          <DialogFooter>
            <Button disabled={pending} onClick={onClose} type="button" variant="secondary">{m.assets_cancel()}</Button>
            <Button disabled={pending || !state?.file} type="submit">{m.assets_upload_submit()}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

interface MoveDialogProps {
  folders: AssetFolderWithCount[]
  m: WebMessages
  pending: boolean
  state: AssetMoveState | null
  onChangeFolderQuery(query: string): void
  onChangeFolder(folderId: string | undefined): void
  onCreateFolder(): void
  onClose(): void
  onSubmit(): void
}

export function MoveDialog({ folders, m, onChangeFolder, onChangeFolderQuery, onClose, onCreateFolder, onSubmit, pending, state }: MoveDialogProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }
  const folderQuery = state?.folderQuery.trim() ?? ''
  const normalizedQuery = folderQuery.toLowerCase()
  const filteredFolders = normalizedQuery
    ? folders.filter((folder) => folder.name.toLowerCase().includes(normalizedQuery) || folder.slug.includes(normalizedQuery))
    : folders
  const canCreateFolder = Boolean(folderQuery) && !folders.some((folder) => folder.name.toLowerCase() === normalizedQuery)

  return (
    <AlertDialog open={Boolean(state)} onOpenChange={(open) => {
      if (!open && !pending) onClose()
    }}>
      <AlertDialogContent>
        <form className="grid gap-5" onSubmit={handleSubmit}>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.assets_move_to_folder()}</AlertDialogTitle>
            <AlertDialogDescription>{state ? m.assets_move_dialog_description({ title: state.asset.displayName }) : ''}</AlertDialogDescription>
          </AlertDialogHeader>
          <label className={searchClassName} htmlFor="asset-move-folder-search">
            <span className="sr-only">{m.assets_move_folder_search_label()}</span>
            <Search aria-hidden="true" size={16} />
            <input
              className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-foreground outline-0 placeholder:text-foreground-tertiary"
              id="asset-move-folder-search"
              onChange={(event) => onChangeFolderQuery(event.target.value)}
              placeholder={m.assets_move_folder_search_placeholder()}
              value={state?.folderQuery ?? ''}
            />
          </label>
          <div className="grid max-h-72 gap-2 overflow-y-auto pr-1">
            <button
              className={cn(
                'flex h-10 items-center justify-between rounded-md bg-gray-100 px-3 text-left text-sm font-semibold text-foreground-secondary hover:text-brand-accent',
                !state?.folderId && activeChipClassName,
              )}
              onClick={() => onChangeFolder(undefined)}
              type="button"
            >
              {m.assets_no_folder_option()}
            </button>
            {filteredFolders.map((folder) => (
              <button
                className={cn(
                  'flex h-10 items-center justify-between rounded-md bg-gray-100 px-3 text-left text-sm font-semibold text-foreground-secondary hover:text-brand-accent',
                  state?.folderId === folder.id && activeChipClassName,
                )}
                key={folder.id}
                onClick={() => onChangeFolder(folder.id)}
                type="button"
              >
                <span className="min-w-0 truncate">{folder.name}</span>
                <span className="text-xs opacity-70">{m.assets_folder_count({ count: folder.assetCount })}</span>
              </button>
            ))}
            {canCreateFolder ? (
              <button className="flex h-10 items-center rounded-md bg-gray-100 px-3 text-left text-sm font-semibold text-brand-accent hover:bg-gray-200" onClick={onCreateFolder} type="button">
                {m.assets_create_folder_named({ name: folderQuery })}
              </button>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>{m.assets_cancel()}</AlertDialogCancel>
            <Button disabled={pending} type="submit">{m.assets_save()}</Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  )
}
