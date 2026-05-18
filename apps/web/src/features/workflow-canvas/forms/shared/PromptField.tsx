interface PromptFieldProps {
  onChange(value: string): void
  value: string
}

export function PromptField({ onChange, value }: PromptFieldProps) {
  return (
    <label className="mina-wc-field">
      <span>Prompt</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}
