import { Upload } from 'lucide-react'
import type { ReactNode } from 'react'

interface LocalMediaUploaderProps {
  ariaLabel?: string | undefined
  accept?: string | undefined
  children?: ReactNode
  className?: string | undefined
  disabled?: boolean | undefined
  onUpload(file: File): void
}

export function LocalMediaUploader({
  accept = 'image/*,video/*,audio/*',
  ariaLabel,
  children,
  className = 'mina-wc-slot-drop',
  disabled,
  onUpload,
}: LocalMediaUploaderProps) {
  return (
    <label aria-label={ariaLabel} className={className}>
      {children ? null : <Upload aria-hidden="true" size={15} />}
      {children ?? 'Upload'}
      <input
        accept={accept}
        disabled={disabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          if (file) {
            onUpload(file)
            event.currentTarget.value = ''
          }
        }}
        type="file"
      />
    </label>
  )
}
