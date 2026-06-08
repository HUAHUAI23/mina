import type { AssetLibrarySourceType, AssetTag } from '@mina/contracts/modules/assets'
import type { ResourceKind } from '@mina/contracts/modules/tasks'
import { FileAudio, FileImage, FileVideo, Folder, Heart, Search } from 'lucide-react'

import { cn } from '@mina/ui/lib/utils'

import type { WebMessages } from '../../../lib/i18n-messages'
import {
  activeChipClassName,
  chipClassName,
  searchClassName,
  toolbarClassName,
} from './asset-library-styles'

const assetKinds = ['image', 'video', 'audio'] as const
const assetSourceTypes = ['local_upload', 'workflow_output', 'external_import'] as const
type VisibleAssetSourceType = (typeof assetSourceTypes)[number]

const visibleAssetSourceTypeFromValue = (value: string): VisibleAssetSourceType | undefined =>
  assetSourceTypes.find((sourceType) => sourceType === value)

interface TagChipsProps {
  activeIds: string[]
  m: WebMessages
  tags: AssetTag[]
  onToggle(tag: AssetTag): void
}

export function TagChips({ activeIds, m, onToggle, tags }: TagChipsProps) {
  return (
    <div className="flex min-w-0 flex-wrap gap-2" aria-label={m.assets_tag_filters()}>
      {tags.map((tag) => {
        const active = activeIds.includes(tag.id)
        return (
          <button className={cn(chipClassName, active && activeChipClassName)} key={tag.id} onClick={() => onToggle(tag)} type="button">
            {tag.name}
            {tag.usageCount > 0 ? <span className="ml-1 opacity-70">{tag.usageCount}</span> : null}
          </button>
        )
      })}
    </div>
  )
}

interface SourceProject {
  id: string
  name: string
}

interface AssetLibraryFiltersProps {
  favoriteOnly: boolean
  foldersOnly: boolean
  hasFilters: boolean
  m: WebMessages
  queryText: string
  selectedKind: ResourceKind | undefined
  selectedSourceProjectId: string | undefined
  selectedSourceType: AssetLibrarySourceType | undefined
  selectedTagIds: string[]
  sourceProjects: SourceProject[]
  tags: AssetTag[]
  onClearFilters(): void
  onSetFavoriteOnly(value: boolean): void
  onSetFoldersOnly(value: boolean): void
  onSetQueryText(value: string): void
  onSetSelectedKind(value: ResourceKind | undefined): void
  onSetSelectedSourceProjectId(value: string | undefined): void
  onSetSelectedSourceType(value: AssetLibrarySourceType | undefined): void
  onToggleTag(tag: AssetTag): void
}

const sourceTypeLabel = (sourceType: AssetLibrarySourceType, m: WebMessages): string => {
  if (sourceType === 'local_upload') return m.assets_source_type_local_upload()
  if (sourceType === 'workflow_output') return m.assets_source_type_workflow_output()
  return m.assets_source_type_external_import()
}

export function AssetLibraryFilters({
  favoriteOnly,
  foldersOnly,
  hasFilters,
  m,
  onClearFilters,
  onSetFavoriteOnly,
  onSetFoldersOnly,
  onSetQueryText,
  onSetSelectedKind,
  onSetSelectedSourceProjectId,
  onSetSelectedSourceType,
  onToggleTag,
  queryText,
  selectedKind,
  selectedSourceProjectId,
  selectedSourceType,
  selectedTagIds,
  sourceProjects,
  tags,
}: AssetLibraryFiltersProps) {
  return (
    <div className={toolbarClassName}>
      <label className={searchClassName} htmlFor="asset-library-search">
        <span className="sr-only">{m.assets_search_label()}</span>
        <Search aria-hidden="true" size={16} />
        <input
          className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-foreground outline-0 placeholder:text-foreground-tertiary"
          id="asset-library-search"
          onChange={(event) => onSetQueryText(event.target.value)}
          placeholder={m.assets_search_placeholder()}
          type="search"
          value={queryText}
        />
      </label>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <button className={cn(chipClassName, foldersOnly && activeChipClassName)} onClick={() => onSetFoldersOnly(!foldersOnly)} type="button">
          <Folder aria-hidden="true" size={13} />
          {m.assets_folders_only()}
        </button>
        <button className={cn(chipClassName, favoriteOnly && activeChipClassName)} onClick={() => onSetFavoriteOnly(!favoriteOnly)} type="button">
          <Heart aria-hidden="true" size={13} />
          {m.assets_favorites()}
        </button>
        {hasFilters ? (
          <button className={chipClassName} onClick={onClearFilters} type="button">
            {m.assets_clear_filters()}
          </button>
        ) : null}
      </div>
      <TagChips activeIds={selectedTagIds} m={m} onToggle={onToggleTag} tags={tags} />
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {assetKinds.map((kind) => (
          <button
            className={cn(chipClassName, selectedKind === kind && activeChipClassName)}
            key={kind}
            onClick={() => onSetSelectedKind(selectedKind === kind ? undefined : kind)}
            type="button"
          >
            {kind === 'image' ? <FileImage aria-hidden="true" size={13} /> : null}
            {kind === 'video' ? <FileVideo aria-hidden="true" size={13} /> : null}
            {kind === 'audio' ? <FileAudio aria-hidden="true" size={13} /> : null}
            {kind === 'image' ? m.assets_kind_image() : kind === 'video' ? m.assets_kind_video() : m.assets_kind_audio()}
          </button>
        ))}
        <select
          aria-label={m.assets_source_type_filter()}
          className="h-8 rounded-full border-0 bg-gray-100 px-3 text-xs font-bold text-foreground-secondary hover:bg-gray-200 hover:text-brand-accent"
          onChange={(event) => onSetSelectedSourceType(visibleAssetSourceTypeFromValue(event.target.value))}
          value={selectedSourceType ?? ''}
        >
          <option value="">{m.assets_all_source_types()}</option>
          {assetSourceTypes.map((sourceType) => (
            <option key={sourceType} value={sourceType}>{sourceTypeLabel(sourceType, m)}</option>
          ))}
        </select>
        {sourceProjects.length > 0 ? (
          <select
            aria-label={m.assets_source_project_filter()}
            className="h-8 rounded-full border-0 bg-gray-100 px-3 text-xs font-bold text-foreground-secondary hover:bg-gray-200 hover:text-brand-accent"
            onChange={(event) => onSetSelectedSourceProjectId(event.target.value || undefined)}
            value={selectedSourceProjectId ?? ''}
          >
            <option value="">{m.assets_all_source_projects()}</option>
            {sourceProjects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}</option>
            ))}
          </select>
        ) : null}
      </div>
    </div>
  )
}
