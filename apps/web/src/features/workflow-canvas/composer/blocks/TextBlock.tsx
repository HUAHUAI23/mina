import { FileText } from 'lucide-react'

import { useMessages } from '../../../../app/i18n-provider'
import { PromptField } from '../../forms/shared/PromptField'
import { useCanvasStore } from '../../store/canvas-store'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import type { ComposerSurface } from '../types'

interface TextBlockProps {
  node: WorkflowCanvasNode
  surface: Exclude<ComposerSurface, 'hidden'>
}

export function TextBlock({ node }: TextBlockProps) {
  const m = useMessages()
  const setNodeText = useCanvasStore((state) => state.setNodeText)

  if (node.data.nodeType !== 'text') {
    return null
  }

  return (
    <section className="grid gap-3" aria-label={m.workflow_canvas_text_node()}>
      <div className="flex items-center justify-between">
        <strong className="text-[0.84rem] text-foreground">{node.data.title}</strong>
        <span className="flex items-center gap-1 text-[0.66rem] font-extrabold text-foreground-tertiary"><FileText aria-hidden="true" size={13} />{m.workflow_canvas_text()}</span>
      </div>
      <PromptField value={node.data.config.text} onChange={(value) => setNodeText(node.id, value)} />
    </section>
  )
}
