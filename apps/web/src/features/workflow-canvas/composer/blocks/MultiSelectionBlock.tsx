import { AlignCenterHorizontal, Boxes, Trash2 } from 'lucide-react'

import type { ComposerSurface } from '../types'

interface MultiSelectionBlockProps {
  nodeIds: string[]
  surface: Exclude<ComposerSurface, 'hidden'>
}

export function MultiSelectionBlock({ nodeIds }: MultiSelectionBlockProps) {
  return (
    <section className="mina-wc-multi-panel flex min-h-[58px] min-w-0 items-center justify-between gap-3.5" aria-label="Multi selection">
      <div className="grid min-w-0 gap-[3px]">
        <strong className="text-[0.92rem] text-foreground">{nodeIds.length} selected</strong>
        <span className="text-[0.68rem] font-extrabold text-foreground-tertiary">Batch actions</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex size-10.5 items-center justify-center rounded-lg border-0 bg-surface-container-low text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground" type="button" title="Align" aria-label="Align selected nodes">
          <AlignCenterHorizontal aria-hidden="true" size={17} />
        </button>
        <button className="flex size-10.5 items-center justify-center rounded-lg border-0 bg-surface-container-low text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground" type="button" title="Group" aria-label="Group selected nodes">
          <Boxes aria-hidden="true" size={17} />
        </button>
        <button className="flex size-10.5 items-center justify-center rounded-lg border-0 bg-surface-container-low text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground" type="button" title="Delete" aria-label="Delete selected nodes">
          <Trash2 aria-hidden="true" size={17} />
        </button>
      </div>
    </section>
  )
}
