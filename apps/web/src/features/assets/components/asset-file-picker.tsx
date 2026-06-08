import { useId, useRef, useState, type ChangeEvent, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react'
import { FileAudio, FileImage, FileVideo, Upload, X } from 'lucide-react'
import { formatNumber, type MinaLocale } from '@mina/i18n'

import { Button } from '@mina/ui/components/button'
import { cn } from '@mina/ui/lib/utils'

import type { WebMessages } from '../../../lib/i18n-messages'
import {
  iconButtonClassName,
  uploadDropZoneActiveClassName,
  uploadDropZoneClassName,
} from './asset-library-styles'

const acceptedAssetFileTypes = 'image/*,video/*,audio/*'
const supportedAssetFileMimePrefixes = ['image/', 'video/', 'audio/'] as const

const isSupportedAssetFile = (file: File): boolean =>
  supportedAssetFileMimePrefixes.some((prefix) => file.type.startsWith(prefix))

const hasDataTransferFiles = (dataTransfer: DataTransfer): boolean =>
  dataTransfer.types.includes('Files') || Array.from(dataTransfer.items).some((item) => item.kind === 'file')

const filesFromDataTransfer = (dataTransfer: DataTransfer): File[] => {
  const itemFiles = Array.from(dataTransfer.items)
    .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
    .filter((file): file is File => Boolean(file))
  return itemFiles.length > 0 ? itemFiles : Array.from(dataTransfer.files)
}

const filesFromClipboard = (event: ClipboardEvent<HTMLElement>): File[] => {
  const itemFiles = Array.from(event.clipboardData.items)
    .map((item) => (item.kind === 'file' ? item.getAsFile() : null))
    .filter((file): file is File => Boolean(file))
  return itemFiles.length > 0 ? itemFiles : Array.from(event.clipboardData.files)
}

const firstSupportedAssetFile = (files: File[]): File | undefined =>
  files.find(isSupportedAssetFile)

const iconForFile = (file: File) => {
  if (file.type.startsWith('image/')) return FileImage
  if (file.type.startsWith('video/')) return FileVideo
  if (file.type.startsWith('audio/')) return FileAudio
  return Upload
}

const formatFileSize = (bytes: number, locale: MinaLocale): string => {
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let value = bytes
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const formattedValue = unitIndex === 0 || value >= 10 ? Math.round(value) : Number(value.toFixed(1))
  const formatted = formatNumber(formattedValue, locale)
  return `${formatted} ${units[unitIndex]}`
}

interface AssetFilePickerProps {
  file: File | null | undefined
  locale: MinaLocale
  m: WebMessages
  pending: boolean
  onChangeFile(file: File | null): void
}

export function AssetFilePicker({ file, locale, m, onChangeFile, pending }: AssetFilePickerProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragActive, setDragActive] = useState(false)
  const [fileError, setFileError] = useState<string | undefined>()
  const FileIcon = file ? iconForFile(file) : Upload

  const selectFile = (candidate: File | null | undefined) => {
    if (!candidate) return
    if (!isSupportedAssetFile(candidate)) {
      setFileError(m.assets_upload_file_unsupported())
      return
    }
    setFileError(undefined)
    onChangeFile(candidate)
  }

  const openFileDialog = () => {
    if (!pending) {
      inputRef.current?.click()
    }
  }

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    selectFile(event.target.files?.item(0))
    event.currentTarget.value = ''
  }

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (pending) return
    if (!hasDataTransferFiles(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    setDragActive(true)
  }

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (pending) return
    if (!hasDataTransferFiles(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'copy'
    setDragActive(true)
  }

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
    setDragActive(false)
  }

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (pending) return
    if (!hasDataTransferFiles(event.dataTransfer)) return
    event.preventDefault()
    event.stopPropagation()
    setDragActive(false)
    const supportedFile = firstSupportedAssetFile(filesFromDataTransfer(event.dataTransfer))
    if (!supportedFile) {
      setFileError(m.assets_upload_file_unsupported())
      return
    }
    selectFile(supportedFile)
  }

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (pending) return
    const files = filesFromClipboard(event)
    if (files.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    const supportedFile = firstSupportedAssetFile(files)
    if (!supportedFile) {
      setFileError(m.assets_upload_file_unsupported())
      return
    }
    selectFile(supportedFile)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    openFileDialog()
  }

  return (
    <div className="grid gap-2">
      <div
        aria-label={m.assets_upload_drop_title()}
        className={cn(uploadDropZoneClassName, dragActive && uploadDropZoneActiveClassName, pending && 'cursor-not-allowed opacity-70')}
        onClick={openFileDialog}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        role="button"
        tabIndex={pending ? -1 : 0}
      >
        <input
          accept={acceptedAssetFileTypes}
          className="sr-only"
          disabled={pending}
          id={inputId}
          onChange={handleInputChange}
          ref={inputRef}
          type="file"
        />
        <div className="grid w-full justify-items-center gap-3">
          <span className={cn(
            'flex size-12 items-center justify-center rounded-full bg-gray-100 text-brand-accent ring-1 ring-outline-ghost ring-inset',
            dragActive && 'bg-brand-accent text-primary-foreground ring-brand-accent',
          )}>
            <FileIcon aria-hidden="true" size={24} />
          </span>
          <div className="grid min-w-0 justify-items-center gap-1">
            <p className="m-0 text-sm font-bold text-foreground">{file ? m.assets_upload_file_selected() : m.assets_upload_drop_title()}</p>
            <p className="m-0 text-xs font-semibold text-foreground-tertiary">{m.assets_upload_drop_description()}</p>
          </div>
        </div>
      </div>
      {file ? (
        <div className="flex min-w-0 items-center justify-between gap-3 rounded-md bg-gray-100 px-3 py-2 text-left">
          <div className="min-w-0">
            <p className="m-0 truncate text-sm font-bold text-foreground">{file.name}</p>
            <p className="m-0 truncate text-xs font-semibold text-foreground-tertiary">
              {file.type || m.assets_upload_unknown_type()} · {formatFileSize(file.size, locale)}
            </p>
          </div>
          <Button
            aria-label={m.assets_upload_remove_file()}
            className={iconButtonClassName}
            disabled={pending}
            onClick={() => {
              setFileError(undefined)
              onChangeFile(null)
            }}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <X aria-hidden="true" size={16} />
          </Button>
        </div>
      ) : null}
      {fileError ? <p className="m-0 text-xs font-bold text-destructive">{fileError}</p> : null}
    </div>
  )
}
