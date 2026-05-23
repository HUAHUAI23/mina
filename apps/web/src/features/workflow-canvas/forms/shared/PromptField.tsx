import { useLayoutEffect, useRef } from 'react'
import { cn } from '@mina/ui/lib/utils'

interface PromptFieldProps {
  error?: string | undefined
  label?: string | undefined
  onBlur?: (() => void) | undefined
  onChange(value: string): void
  placeholder?: string | undefined
  textareaClassName?: string | undefined
  value: string
}

const fieldClassName = 'mina-wc-prompt-field grid gap-1.5'
const textareaClassName = 'min-h-[126px] resize-none rounded-lg border-0 bg-transparent p-0 text-[1.06rem] leading-normal text-foreground outline-0 placeholder:text-foreground-quaternary'
const errorClassName = 'text-[0.72rem] not-italic text-destructive'

export function PromptField({
  error,
  label = 'Prompt',
  onBlur,
  onChange,
  placeholder = 'Describe the frame you want to generate, use / for commands, @ for assets',
  textareaClassName: textareaClassNameProp,
  value,
}: PromptFieldProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) {
      return
    }
    const maxHeight = Number.parseFloat(window.getComputedStyle(textarea).maxHeight)
    textarea.style.height = '0px'
    textarea.style.height = `${Number.isFinite(maxHeight) ? Math.min(textarea.scrollHeight, maxHeight) : textarea.scrollHeight}px`
  }, [value])

  return (
    <label className={fieldClassName}>
      <span className="sr-only">{label}</span>
      <textarea
        ref={textareaRef}
        className={cn(textareaClassName, textareaClassNameProp)}
        value={value}
        placeholder={placeholder}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <em className={errorClassName}>{error}</em> : null}
    </label>
  )
}
