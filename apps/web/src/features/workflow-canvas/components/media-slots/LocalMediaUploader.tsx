import { Upload } from 'lucide-react'

interface LocalMediaUploaderProps {
  disabled?: boolean | undefined
  onUpload(file: File): void
}

export function LocalMediaUploader({ disabled, onUpload }: LocalMediaUploaderProps) {
  return (
    <label className="mina-wc-upload-button">
      <Upload aria-hidden="true" size={15} />
      Upload
      <input
        accept="image/*,video/*,audio/*"
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
