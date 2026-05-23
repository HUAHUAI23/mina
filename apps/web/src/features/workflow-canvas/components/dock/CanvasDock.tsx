import { useMemo } from 'react'
import { Panel } from '@xyflow/react'
import { cn } from '@mina/ui/lib/utils'

import { composerContextFromSelection } from '../../composer/context'
import { MediaTaskFormProvider } from '../../composer/media-task-form'
import { composerRegistry } from '../../composer/registry'
import type { ComposerContext, ComposerRuntime } from '../../composer/types'
import '../../composer/blocks'
import { isMediaGenerationNode } from '../../domain/canvas-node-types'
import { useFlowRenderStore } from '../../render/flow-render-store'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { useCanvasNode } from '../../store/selectors'

interface CanvasDockProps {
  onRunNode(nodeId: string): void
  runError?: string | undefined
  runningNodeId?: string | undefined
}

const dockShellClassName = 'mina-wc-dock-shell mina-wc-config-card grid min-h-0 w-full gap-4 overflow-visible rounded-2xl bg-[linear-gradient(180deg,color-mix(in_oklch,var(--surface-container-lowest)_96%,transparent),color-mix(in_oklch,var(--surface-container-lowest)_91%,transparent))] px-[26px] pt-6 pb-[18px] text-foreground shadow-[0_30px_66px_-38px_color-mix(in_oklch,var(--foreground)_22%,transparent),inset_0_0_0_1px_color-mix(in_oklch,var(--foreground-quaternary)_7%,transparent)] pointer-events-auto max-h-[min(62dvh,720px)] max-[720px]:max-h-[min(56dvh,520px)] max-[720px]:p-3.5'
const dockBlockClassName = 'mina-wc-dock-block min-w-0'

export function CanvasDock({ onRunNode, runError, runningNodeId }: CanvasDockProps) {
  const activePanel = useCanvasUiStore((state) => state.activeNodePanel)
  const selectedNodeIds = useCanvasUiStore((state) => state.selectedNodeIds)
  const dockPassive = useFlowRenderStore((state) => (
    state.interaction.draggingNodeIds.length > 0 ||
    state.interaction.selectionDragActive ||
    state.interaction.viewportMoving
  ))
  const activePanelNode = useCanvasNode(activePanel?.panel === 'config' ? activePanel.nodeId : '')
  const selectedNode = useCanvasNode(selectedNodeIds.length === 1 ? selectedNodeIds[0] ?? '' : '')
  const activeNode = activePanelNode ?? selectedNode
  const context = composerContextFromSelection(selectedNodeIds, activeNode)
  const runtime = useMemo<ComposerRuntime>(
    () => ({ onRunNode, runError, runningNodeId }),
    [onRunNode, runError, runningNodeId],
  )
  const blocks = useMemo(() => composerRegistry.resolve(context), [context])
  const hidden = blocks.length === 0

  return (
    <Panel
      position="bottom-center"
      className="mina-wc-canvas-dock nodrag nowheel nopan"
      data-mina-canvas-ignore="true"
      data-mina-canvas-panel-root="true"
    >
      <section
        className={cn(
          dockShellClassName,
          context.kind === 'node' && 'px-4 pt-3.5 pb-4',
          context.kind === 'empty' && 'w-[min(860px,calc(100vw_-_48px))] rounded-[26px] p-3 max-[720px]:p-[7px]',
          (hidden || dockPassive) && 'opacity-30',
          hidden && 'pointer-events-none',
        )}
        data-context={context.kind}
        data-hidden={hidden ? 'true' : undefined}
        data-passive={dockPassive ? 'true' : undefined}
      >
        {renderDockContent(context, runtime, blocks)}
      </section>
    </Panel>
  )
}

function renderDockContent(
  context: ComposerContext,
  runtime: ComposerRuntime,
  blocks: ReturnType<typeof composerRegistry.resolve>,
) {
  if (context.kind === 'node' && isMediaGenerationNode(context.node)) {
    return (
      <MediaTaskFormProvider node={context.node} onRun={() => runtime.onRunNode(context.node.id)}>
        {() => <DockBlocks blocks={blocks} context={context} runtime={runtime} />}
      </MediaTaskFormProvider>
    )
  }

  return <DockBlocks blocks={blocks} context={context} runtime={runtime} />
}

function DockBlocks({
  blocks,
  context,
  runtime,
}: {
  blocks: ReturnType<typeof composerRegistry.resolve>
  context: ComposerContext
  runtime: ComposerRuntime
}) {
  return (
    <>
      {blocks.map((spec) => {
        const surface = spec.surface(context)
        if (surface === 'hidden') {
          return null
        }
        const Component = spec.Component
        return (
          <div className={dockBlockClassName} key={spec.id}>
            <Component {...spec.selectProps(context, runtime)} surface={surface} />
          </div>
        )
      })}
    </>
  )
}
