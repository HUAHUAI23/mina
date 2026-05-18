import { Play } from 'lucide-react'

interface RunControlsProps {
  disabled?: boolean
  error?: string | undefined
  onRun(): void
  running?: boolean | undefined
}

export function RunControls({ disabled, error, onRun, running }: RunControlsProps) {
  return (
    <div className="mina-wc-run-controls">
      {error ? <p>{error}</p> : null}
      <button disabled={disabled || running} onClick={onRun} type="button">
        <Play aria-hidden="true" size={15} />
        {running ? 'Running' : 'Run'}
      </button>
    </div>
  )
}
