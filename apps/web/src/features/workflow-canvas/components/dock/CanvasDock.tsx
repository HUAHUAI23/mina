import { useCallback, useMemo, type ReactNode } from 'react'
import { Panel, useReactFlow } from '@xyflow/react'
import { cn } from '@mina/ui/lib/utils'

import { useMessages } from '../../../../app/i18n-provider'
import { composerContextFromSelection } from '../../composer/context'
import { submitComposerDraft } from '../../composer/draft-submit'
import { MediaTaskFormProvider } from '../../composer/media-task-form'
import { composerRegistry } from '../../composer/registry'
import type { ComposerContext, ComposerRuntime } from '../../composer/types'
import '../../composer/blocks'
import '../../composer/slots'
import { isMediaGenerationNode, MEDIA_GENERATION_NODE_FRAME } from '../../domain/canvas-node-types'
import type { ComposerDraftState } from '../../store/canvas-ui-store'
import type { CanvasStore } from '../../store/store-types'
import { useFlowRenderStore } from '../../render/flow-render-store'
import { useCanvasStore } from '../../store/canvas-store'
import { useCanvasUiStore } from '../../store/canvas-ui-store'
import { useCanvasNode } from '../../store/selectors'
import { useAgentChatUiStore } from '../../agent-chat/store/agent-chat-ui-store'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../../domain/flow-types'

interface CanvasDockProps {
  onRunNode(nodeId: string): void
  runError?: string | undefined
  runningNodeId?: string | undefined
}

const dockFrameBaseClassName = 'mina-wc-dock-shell mina-wc-floating-surface grid min-h-0 overflow-visible text-foreground pointer-events-auto max-h-[min(62dvh,720px)] max-[720px]:max-h-[min(58dvh,540px)] [--mina-wc-dock-expanded-width:min(760px,calc(100vw_-_48px))] [--mina-wc-dock-collapsed-width:min(620px,calc(100vw_-_48px))] max-[720px]:[--mina-wc-dock-expanded-width:calc(100vw_-_24px)] max-[720px]:[--mina-wc-dock-collapsed-width:calc(100vw_-_24px)]'
const defaultDockFrameClassName = cn(dockFrameBaseClassName, 'w-(--mina-wc-dock-collapsed-width) gap-4 rounded-[22px] px-5 py-4 max-[720px]:p-3.5')
const nodeDockFrameClassName = cn(dockFrameBaseClassName, 'w-(--mina-wc-dock-expanded-width) gap-2.5 overflow-hidden rounded-[22px] p-2 max-[720px]:p-1.5')
const emptyExpandedDockFrameClassName = cn(dockFrameBaseClassName, 'w-(--mina-wc-dock-expanded-width) gap-2.5 overflow-hidden rounded-[26px] p-1 max-[720px]:p-1.5')
const emptyCollapsedDockFrameClassName = cn(dockFrameBaseClassName, 'w-(--mina-wc-dock-collapsed-width) gap-2 rounded-[26px] p-2 max-[720px]:p-2')
const passiveDockFrameClassName = 'opacity-40'
const hiddenDockFrameClassName = 'translate-y-2 opacity-0 pointer-events-none'
const dockBlockClassName = 'mina-wc-dock-block min-w-0'
type AddMediaGenerationNode = CanvasStore['addMediaGenerationNode']
type MediaNodeType = Parameters<AddMediaGenerationNode>[0]['nodeType']

const nodeSizeEstimate = (_nodeType: MediaNodeType): { height: number; width: number } =>
  MEDIA_GENERATION_NODE_FRAME

export function CanvasDock({ onRunNode, runError, runningNodeId }: CanvasDockProps) {
  const m = useMessages()
  const activePanel = useCanvasUiStore((state) => state.activeNodePanel)
  const composerDraft = useCanvasUiStore((state) => state.composerDraft)
  const resetComposerDraft = useCanvasUiStore((state) => state.resetComposerDraft)
  const setDraftError = useCanvasUiStore((state) => state.setDraftError)
  const setDraftExpanded = useCanvasUiStore((state) => state.setDraftExpanded)
  const selectedNodeIds = useCanvasUiStore((state) => state.selectedNodeIds)
  const addMediaGenerationNode = useCanvasStore((state) => state.addMediaGenerationNode)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  const reactFlow = useReactFlow<WorkflowFlowNode, WorkflowFlowEdge>()
  const dockPassive = useFlowRenderStore((state) => (
    state.interaction.draggingNodeIds.length > 0 ||
    state.interaction.viewportMoving
  ))
  const dockInteractionHidden = useFlowRenderStore((state) => state.interaction.selectionDragActive)
  const agentComposerOpen = useAgentChatUiStore((state) => state.composerOpen)
  const activePanelNode = useCanvasNode(activePanel?.panel === 'config' ? activePanel.nodeId : '')
  const selectedNode = useCanvasNode(selectedNodeIds.length === 1 ? selectedNodeIds[0] ?? '' : '')
  const activeNode = activePanelNode ?? selectedNode
  const context = composerContextFromSelection(selectedNodeIds, activeNode)
  const runtime = useMemo<ComposerRuntime>(
    () => ({ onRunNode, runError, runningNodeId }),
    [onRunNode, runError, runningNodeId],
  )
  const blocks = useMemo(() => composerRegistry.resolve(context), [context])
  const hidden = blocks.length === 0 || dockInteractionHidden || agentComposerOpen
  const getNewNodePosition = useCallback((nodeType: MediaNodeType) => {
    if (!reactFlow.viewportInitialized || typeof window === 'undefined') {
      return undefined
    }
    const size = nodeSizeEstimate(nodeType)
    const center = reactFlow.screenToFlowPosition({
      x: window.innerWidth / 2,
      y: Math.max(160, window.innerHeight / 2 - 80),
    })
    return {
      x: Math.round(center.x - size.width / 2),
      y: Math.round(center.y - size.height / 2),
    }
  }, [reactFlow])
  const focusNode = useCallback((nodeId: string) => {
    if (typeof window === 'undefined') {
      return
    }
    let attempts = 0
    const focusWhenMounted = () => {
      attempts += 1
      if (!reactFlow.getNode(nodeId) && attempts < 5) {
        window.requestAnimationFrame(focusWhenMounted)
        return
      }
      void reactFlow.fitView({
        duration: 220,
        maxZoom: 1,
        minZoom: 0.72,
        nodes: [{ id: nodeId }],
        padding: 0.45,
      })
    }
    window.requestAnimationFrame(focusWhenMounted)
  }, [reactFlow])
  const submitDraft = useCallback(
    (snapshot: ComposerDraftState) =>
      submitComposerDraft(
        snapshot,
        {
          addMediaGenerationNode,
          focusNode,
          getNewNodePosition,
          openNodePanel,
          resetComposerDraft,
          setDraftError,
          setDraftExpanded,
        },
        m,
      ),
    [
      addMediaGenerationNode,
      focusNode,
      getNewNodePosition,
      m,
      openNodePanel,
      resetComposerDraft,
      setDraftError,
      setDraftExpanded,
    ],
  )

  return (
    <Panel
      position="bottom-center"
      className="mina-wc-canvas-dock nodrag nowheel nopan"
      data-mina-canvas-ignore="true"
      data-mina-canvas-panel-root="true"
    >
      <DockFrame
        data-context={context.kind}
        data-hidden={hidden ? 'true' : undefined}
        data-passive={dockPassive ? 'true' : undefined}
        draftExpanded={composerDraft.expanded}
        hidden={hidden}
        kind={context.kind}
        passive={dockPassive}
      >
        {renderDockContent(context, runtime, blocks, {
          composerDraft,
          submitDraft,
        })}
      </DockFrame>
    </Panel>
  )
}

function DockFrame({
  children,
  'data-context': dataContext,
  'data-hidden': dataHidden,
  'data-passive': dataPassive,
  draftExpanded,
  hidden,
  kind,
  passive,
}: {
  children: ReactNode
  'data-context': ComposerContext['kind']
  'data-hidden': 'true' | undefined
  'data-passive': 'true' | undefined
  draftExpanded: boolean
  hidden: boolean
  kind: ComposerContext['kind']
  passive: boolean
}) {
  const stateClassName = hidden ? hiddenDockFrameClassName : passive ? passiveDockFrameClassName : ''
  const dataProps = {
    'data-context': dataContext,
    'data-hidden': dataHidden,
    'data-passive': dataPassive,
  }

  if (kind === 'node') {
    return <section className={cn(nodeDockFrameClassName, stateClassName)} {...dataProps}>{children}</section>
  }

  if (kind === 'empty') {
    const className = draftExpanded ? emptyExpandedDockFrameClassName : emptyCollapsedDockFrameClassName
    return <section className={cn(className, stateClassName)} {...dataProps}>{children}</section>
  }

  return <section className={cn(defaultDockFrameClassName, stateClassName)} {...dataProps}>{children}</section>
}

function renderDockContent(
  context: ComposerContext,
  runtime: ComposerRuntime,
  blocks: ReturnType<typeof composerRegistry.resolve>,
  draftRuntime: {
    composerDraft: ComposerDraftState
    submitDraft(snapshot: ComposerDraftState): Promise<void>
  },
) {
  if (context.kind === 'node' && isMediaGenerationNode(context.node)) {
    return (
      <MediaTaskFormProvider kind="node" node={context.node} onRun={() => runtime.onRunNode(context.node.id)}>
        {() => <DockBlocks blocks={blocks} context={context} runtime={runtime} />}
      </MediaTaskFormProvider>
    )
  }
  if (context.kind === 'empty') {
    return (
      <MediaTaskFormProvider
        kind="draft"
        draft={draftRuntime.composerDraft}
        onSubmitDraft={draftRuntime.submitDraft}
      >
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
