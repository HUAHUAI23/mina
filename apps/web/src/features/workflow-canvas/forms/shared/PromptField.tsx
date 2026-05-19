interface PromptFieldProps {
  error?: string | undefined
  label?: string | undefined
  onBlur?: (() => void) | undefined
  onChange(value: string): void
  placeholder?: string | undefined
  value: string
}

export function PromptField({
  error,
  label = 'Prompt',
  onBlur,
  onChange,
  placeholder = 'Describe the frame you want to generate, use / for commands, @ for assets',
  value,
}: PromptFieldProps) {
  return (
    <label className="mina-wc-field mina-wc-prompt-field">
      <span className="sr-only">{label}</span>
      <textarea
        value={value}
        placeholder={placeholder}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <em>{error}</em> : null}
    </label>
  )
}
