import { useLayoutEffect, useRef } from 'react'
import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../../app/i18n-provider'

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
  onBlur,
  onChange,
  label,
  placeholder,
  textareaClassName: textareaClassNameProp,
  value,
}: PromptFieldProps) {
  const m = useMessages()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const resolvedLabel = label ?? m.workflow_canvas_prompt()
  const resolvedPlaceholder = placeholder ?? m.workflow_canvas_prompt_placeholder_full()

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
      <span className="sr-only">{resolvedLabel}</span>
      <textarea
        ref={textareaRef}
        className={cn(textareaClassName, textareaClassNameProp)}
        value={value}
        placeholder={resolvedPlaceholder}
        onBlur={onBlur}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <em className={errorClassName}>{error}</em> : null}
    </label>
  )
}
