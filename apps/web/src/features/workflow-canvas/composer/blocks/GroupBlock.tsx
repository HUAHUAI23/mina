import { RunControls } from '../../components/panels/RunControls'
import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'
import { useMessages } from '../../../../app/i18n-provider'
import type { ComposerRuntime, ComposerSurface } from '../types'

interface GroupBlockProps {
  node: WorkflowCanvasNode
  runtime: ComposerRuntime
  surface: Exclude<ComposerSurface, 'hidden'>
}

export function GroupBlock({ node, runtime }: GroupBlockProps) {
  const m = useMessages()

  if (node.data.nodeType !== 'flow_group' && node.data.nodeType !== 'node_group') {
    return null
  }

  return (
    <section className="grid gap-3" aria-label={m.workflow_canvas_group_node()}>
      <div className="flex items-center justify-between">
        <strong className="text-[0.84rem] text-foreground">{node.data.title}</strong>
        <span className="text-[0.66rem] font-extrabold text-foreground-tertiary">{node.data.nodeType === 'flow_group' ? m.workflow_canvas_executable_scope() : m.workflow_canvas_organization()}</span>
      </div>
      {node.data.nodeType === 'flow_group' ? (
        <RunControls
          onRun={() => runtime.onRunNode(node.id)}
          running={runtime.runningNodeId === node.id}
          error={runtime.runError}
        />
      ) : null}
    </section>
  )
}
