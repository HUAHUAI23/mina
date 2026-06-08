import type { LucideIcon } from 'lucide-react'

interface StructuralNodeToolbarButtonProps {
  disabled?: boolean | undefined
  icon: LucideIcon
  label: string
  onClick(): void
  showLabel?: boolean | undefined
}

const iconOnlyButtonClassName = 'nodrag nopan nowheel flex size-8 items-center justify-center rounded-full border-0 bg-transparent text-foreground-tertiary hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:text-foreground-quaternary transition-all duration-150'
const labeledButtonClassName = 'nodrag nopan nowheel flex h-8 max-w-44 items-center gap-1.5 rounded-full border-0 bg-transparent px-3 text-xs font-bold text-foreground-tertiary hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:text-foreground-quaternary transition-all duration-150'

export function StructuralNodeToolbarButton({
  disabled,
  icon: Icon,
  label,
  onClick,
  showLabel,
}: StructuralNodeToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      className={showLabel ? labeledButtonClassName : iconOnlyButtonClassName}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      onPointerDown={(event) => event.stopPropagation()}
      title={label}
      type="button"
    >
      <Icon aria-hidden="true" size={15} />
      {showLabel ? <span className="truncate">{label}</span> : null}
    </button>
  )
}
