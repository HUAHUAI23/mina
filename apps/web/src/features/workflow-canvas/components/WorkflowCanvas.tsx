import { Profiler, memo, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
} from '@xyflow/react'
import type { ReactFlowInstance } from '@xyflow/react'

import { useI18n } from '../../../app/i18n-provider'
import { usePointerBackground } from '../../../app/use-pointer-background'
import { MediaEdge } from './edges/MediaEdge'
import { WorkflowConnectionLine } from './edges/WorkflowConnectionLine'
import { WorkflowFloatingConnectionLine } from './edges/WorkflowFloatingConnectionLine'
import { CanvasAddMenu } from './CanvasAddMenu'
import { CanvasSelectionOverlay } from './CanvasSelectionOverlay'
import { CanvasViewportControls } from './CanvasViewportControls'
import { FlowGroupNode } from './nodes/FlowGroupNode'
import { ImageGenerationNode } from './nodes/MediaGenerationNode/ImageGenerationNode'
import { VideoGenerationNode } from './nodes/MediaGenerationNode/VideoGenerationNode'
import { NodeGroupNode } from './nodes/NodeGroupNode'
import { TextNode } from './nodes/TextNode'
import { CanvasDock } from './dock/CanvasDock'
import { AgentChatOverlay } from '../agent-chat/components/AgentChatOverlay'
import { NodeHistoryRail } from './panels/NodeHistoryRail'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { useCanvasAddMenuController } from '../react-flow/use-canvas-add-menu-controller'
import { useCanvasDevGlobals } from '../react-flow/use-canvas-dev-globals'
import { useCanvasInteractionHandlers } from '../react-flow/use-canvas-interaction-handlers'
import { useCanvasSelectionController } from '../react-flow/use-canvas-selection-controller'
import { useCanvasViewportChrome } from '../react-flow/use-canvas-viewport-chrome'
import { useWorkflowFlowHandlers } from '../react-flow/use-workflow-flow-handlers'
import { useWorkflowUndoShortcuts } from '../react-flow/use-workflow-undo-shortcuts'
import { recordCanvasProfilerCommit } from '../diagnostics/canvas-profiler-marks'
import { useFlowRenderStore } from '../render/flow-render-store'
import { getFlowPerformancePolicy } from '../render/flow-performance-policy'
import { useWorkflowRuntimeStore } from '../store/workflow-runtime-store'
import { useCanvasStore } from '../store/canvas-store'
import { useCanvasEdgeCount, useCanvasMediaNodeCount, useCanvasNodeCount } from '../store/selectors'
import {
  WORKFLOW_BACKGROUND_GEOMETRY,
  WORKFLOW_CANVAS_GEOMETRY_CSS_VARS,
  WORKFLOW_CONNECTION_GEOMETRY,
} from '../workflow-canvas-geometry'
import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowFlowEdgeTypes,
  WorkflowFlowNodeTypes,
} from '../domain/flow-types'

interface WorkflowCanvasProps {
  onRunNode(nodeId: string): void
  onSelectOutput(nodeId: string, taskId: string, outputResourceId: string, outputIndex: number): void
  runError?: string | undefined
  runningNodeId?: string | undefined
  workflowId: string
}

const edgeTypes = {
  media: MediaEdge,
} satisfies WorkflowFlowEdgeTypes

const nodeTypes = {
  image_generation: ImageGenerationNode,
  video_generation: VideoGenerationNode,
  text: TextNode,
  flow_group: FlowGroupNode,
  node_group: NodeGroupNode,
} satisfies WorkflowFlowNodeTypes

const MINIMAP_INTERACTION_DISABLED_NODE_THRESHOLD = 3_000
const MINIMAP_FALLBACK_NODE_THRESHOLD = 5_000
const WORKFLOW_CANVAS_PAN_ON_DRAG_BUTTONS = [1, 2]
const WORKFLOW_CANVAS_PAN_ON_SCROLL_SPEED = 0.8

export function WorkflowCanvas({ onRunNode, onSelectOutput, runError, runningNodeId, workflowId }: WorkflowCanvasProps) {
  const { locale } = useI18n()
  useHydrateFlowRender()
  useCanvasDevGlobals()
  const flowNodes = useFlowRenderStore((state) => state.flowNodes)
  const flowEdges = useFlowRenderStore((state) => state.flowEdges)
  useWorkflowUndoShortcuts()
  const nodeCount = useCanvasNodeCount()
  const edgeCount = useCanvasEdgeCount()
  const mediaNodeCount = useCanvasMediaNodeCount()
  const setRuntime = useWorkflowRuntimeStore((state) => state.setRuntime)
  const addMenu = useCanvasUiStore((state) => state.addMenu)
  const addMenuPreviewLine = useCanvasUiStore((state) => state.addMenuPreviewLine)
  const {
    onConnect,
    onEdgesChange,
    isValidConnection,
    onMove,
    onMoveEnd,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    onNodesChange,
    onSelectionDragStart,
    onSelectionDragStop,
  } = useWorkflowFlowHandlers()
  const reactFlowRef = useRef<ReactFlowInstance<WorkflowFlowNode, WorkflowFlowEdge> | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pointerBackgroundHandlers = usePointerBackground()
  const {
    handleConnectEnd,
    handleConnectStart,
    openCanvasAddMenu,
  } = useCanvasAddMenuController({
    reactFlowInstanceRef: reactFlowRef,
    stageRef,
  })
  const {
    handleCanvasDoubleClick,
    handleEdgeMouseEnter,
    handleEdgeMouseLeave,
    handleNodeClick,
    handlePaneClick,
    handleSelectionChange,
    handleSelectionEnd,
    handleSelectionStart,
  } = useCanvasInteractionHandlers({ openCanvasAddMenu })
  const {
    handleMove,
    handleMoveEnd,
    handleMoveStart,
    handleReactFlowInit,
  } = useCanvasViewportChrome({
    onMove,
    onMoveEnd,
    onMoveStart,
    reactFlowInstanceRef: reactFlowRef,
    stageRef,
  })
  const runtimeActions = useMemo(
    () => ({ onRunNode, onSelectOutput }),
    [onRunNode, onSelectOutput],
  )
  const performancePolicy = useMemo(
    () => getFlowPerformancePolicy({ edgeCount, mediaNodeCount, nodeCount }),
    [edgeCount, mediaNodeCount, nodeCount],
  )
  const shouldRenderMiniMapFallback = nodeCount >= MINIMAP_FALLBACK_NODE_THRESHOLD
  const isMiniMapInteractive = nodeCount < MINIMAP_INTERACTION_DISABLED_NODE_THRESHOLD

  useEffect(() => {
    setRuntime({ actions: runtimeActions, runError, runningNodeId })
  }, [runError, runningNodeId, runtimeActions, setRuntime])

  const {
    onPointerDownCapture,
    selectionRect,
  } = useCanvasSelectionController({
    nodes: flowNodes,
    onSelectionBoxEnd: handleSelectionEnd,
    onSelectionBoxStart: handleSelectionStart,
    reactFlowInstanceRef: reactFlowRef,
    stageRef,
  })
  return (
    <ReactFlowProvider>
      <Profiler id="WorkflowCanvas" onRender={recordCanvasProfilerCommit}>
        <div
          className="mina-wc-flow-shell h-full w-full"
          onDoubleClick={handleCanvasDoubleClick}
          onPointerDownCapture={onPointerDownCapture}
          onPointerLeave={pointerBackgroundHandlers.onPointerLeave}
          onPointerMove={pointerBackgroundHandlers.onPointerMove}
          ref={stageRef}
          style={WORKFLOW_CANVAS_GEOMETRY_CSS_VARS}
        >
          <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
            connectionLineComponent={WorkflowConnectionLine}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={WORKFLOW_CONNECTION_GEOMETRY.radius}
            edgeTypes={edgeTypes}
            edges={flowEdges}
            fitView
            fitViewOptions={{ maxZoom: 1, padding: 0.24 }}
            isValidConnection={isValidConnection}
            multiSelectionKeyCode="Control"
            nodes={flowNodes}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onConnectEnd={handleConnectEnd}
            onConnectStart={handleConnectStart}
            onEdgesChange={onEdgesChange}
            onEdgeMouseEnter={handleEdgeMouseEnter}
            onEdgeMouseLeave={handleEdgeMouseLeave}
            onMove={handleMove}
            onMoveEnd={handleMoveEnd}
            onMoveStart={handleMoveStart}
            onInit={handleReactFlowInit}
            onNodeClick={handleNodeClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onNodesChange={onNodesChange}
            onPaneClick={handlePaneClick}
            onSelectionChange={handleSelectionChange}
            onSelectionDragStart={onSelectionDragStart}
            onSelectionDragStop={onSelectionDragStop}
            onSelectionEnd={handleSelectionEnd}
            onSelectionStart={handleSelectionStart}
            onlyRenderVisibleElements={performancePolicy.onlyRenderVisibleElements}
            panActivationKeyCode="Space"
            panOnDrag={WORKFLOW_CANVAS_PAN_ON_DRAG_BUTTONS}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            panOnScrollSpeed={WORKFLOW_CANVAS_PAN_ON_SCROLL_SPEED}
            selectNodesOnDrag={false}
            selectionOnDrag={false}
            selectionMode={SelectionMode.Partial}
            zoomActivationKeyCode={['Meta', 'Control']}
            zoomOnDoubleClick={false}
            zoomOnPinch
            zoomOnScroll
          >
            <Background
              id="base"
              className="mina-wc-react-flow-background"
              color="rgba(24, 24, 27, 0.22)"
              gap={WORKFLOW_BACKGROUND_GEOMETRY.dotGap}
              size={WORKFLOW_BACKGROUND_GEOMETRY.dotSize}
              variant={BackgroundVariant.Dots}
            />
            <Background
              id="pointer-highlight"
              className="mina-wc-react-flow-background-highlight"
              color="rgba(24, 24, 27, 0.62)"
              gap={WORKFLOW_BACKGROUND_GEOMETRY.dotGap}
              size={WORKFLOW_BACKGROUND_GEOMETRY.dotSize}
              variant={BackgroundVariant.Dots}
            />
            <CanvasViewportControls
              isMiniMapInteractive={isMiniMapInteractive}
              locale={locale}
              nodeCount={nodeCount}
              reactFlowInstanceRef={reactFlowRef}
              shouldRenderMiniMapFallback={shouldRenderMiniMapFallback}
            />
            <CanvasSelectionOverlay selectionRect={selectionRect} />
            {addMenuPreviewLine ? (
              <WorkflowFloatingConnectionLine
                sourcePosition={addMenuPreviewLine.sourcePosition}
                sourceX={addMenuPreviewLine.sourceX}
                sourceY={addMenuPreviewLine.sourceY}
                targetPosition={addMenuPreviewLine.targetPosition}
                targetX={addMenuPreviewLine.targetX}
                targetY={addMenuPreviewLine.targetY}
              />
            ) : null}
            {addMenu ? <CanvasAddMenu state={addMenu} /> : null}
            <NodeHistoryRail />
            <AgentChatOverlay workflowId={workflowId} />
            <CanvasDock onRunNode={onRunNode} runError={runError} runningNodeId={runningNodeId} />
          </ReactFlow>
        </div>
      </Profiler>
    </ReactFlowProvider>
  )
}

export const MemoizedWorkflowCanvas = memo(WorkflowCanvas)

function useHydrateFlowRender(): void {
  const hydrateRenderFromDocument = useFlowRenderStore((state) => state.hydrateFromDocument)

  useEffect(() => {
    const hydrate = () => {
      const canvas = useCanvasStore.getState()
      const selectedNodeIds = useCanvasUiStore.getState().selectedNodeIds
      hydrateRenderFromDocument({
        edges: canvas.edges,
        nodes: canvas.nodes,
        selectedNodeIds,
      })
    }
    hydrate()
    const unsubscribeCanvas = useCanvasStore.subscribe(
      (state, previousState) => {
        if (state.nodes === previousState.nodes && state.edges === previousState.edges) {
          return
        }
        hydrate()
      },
    )
    const unsubscribeSelection = useCanvasUiStore.subscribe(
      (state, previousState) => {
        if (state.selectedNodeIds === previousState.selectedNodeIds) {
          return
        }
        hydrate()
      },
    )
    return () => {
      unsubscribeCanvas()
      unsubscribeSelection()
    }
  }, [hydrateRenderFromDocument])
}
