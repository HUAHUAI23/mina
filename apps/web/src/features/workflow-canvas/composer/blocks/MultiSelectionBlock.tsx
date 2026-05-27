import { AlignCenterHorizontal, Boxes, Trash2 } from 'lucide-react'

import { useMessages } from '../../../../app/i18n-provider'
import type { ComposerSurface } from '../types'

interface MultiSelectionBlockProps {
  nodeIds: string[]
  surface: Exclude<ComposerSurface, 'hidden'>
}

export function MultiSelectionBlock({ nodeIds }: MultiSelectionBlockProps) {
  const m = useMessages()

  return (
    <section className="mina-wc-multi-panel flex min-h-[58px] min-w-0 items-center justify-between gap-3.5" aria-label={m.workflow_canvas_multi_selection()}>
      <div className="grid min-w-0 gap-[3px]">
        <strong className="text-[0.92rem] text-foreground">{m.workflow_canvas_selected_count({ count: nodeIds.length })}</strong>
        <span className="text-[0.68rem] font-extrabold text-foreground-tertiary">{m.workflow_canvas_batch_actions()}</span>
      </div>
      <div className="flex items-center gap-2">
        <button className="flex size-10.5 items-center justify-center rounded-lg border-0 bg-surface-container-low text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground" type="button" title={m.workflow_canvas_align_selected()} aria-label={m.workflow_canvas_align_selected()}>
          <AlignCenterHorizontal aria-hidden="true" size={17} />
        </button>
        <button className="flex size-10.5 items-center justify-center rounded-lg border-0 bg-surface-container-low text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground" type="button" title={m.workflow_canvas_group_selected()} aria-label={m.workflow_canvas_group_selected()}>
          <Boxes aria-hidden="true" size={17} />
        </button>
        <button className="flex size-10.5 items-center justify-center rounded-lg border-0 bg-surface-container-low text-foreground-tertiary hover:bg-surface-container-high hover:text-foreground" type="button" title={m.workflow_canvas_delete_selected()} aria-label={m.workflow_canvas_delete_selected()}>
          <Trash2 aria-hidden="true" size={17} />
        </button>
      </div>
    </section>
  )
}
