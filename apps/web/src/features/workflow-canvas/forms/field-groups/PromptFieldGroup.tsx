import { PromptField } from '../shared/PromptField'

interface PromptFieldGroupProps {
  error?: string | undefined
  onBlur(): void
  onChange(value: string): void
  value: string
}

export function PromptFieldGroup({ error, onBlur, onChange, value }: PromptFieldGroupProps) {
  return (
    <section className="mina-wc-prompt-section" aria-label="Prompt">
      <PromptField
        value={value}
        error={error}
        onBlur={onBlur}
        onChange={onChange}
      />
    </section>
  )
}
