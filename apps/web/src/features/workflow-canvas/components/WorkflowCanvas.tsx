import { Profiler, memo, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import type { NodeMouseHandler } from '@xyflow/react'

import { MediaEdge } from './edges/MediaEdge'
import { WorkflowConnectionLine } from './edges/WorkflowConnectionLine'
import { FlowGroupNode } from './nodes/FlowGroupNode'
import { ImageGenerationNode } from './nodes/MediaGenerationNode/ImageGenerationNode'
import { VideoGenerationNode } from './nodes/MediaGenerationNode/VideoGenerationNode'
import { NodeGroupNode } from './nodes/NodeGroupNode'
import { TextNode } from './nodes/TextNode'
import { CanvasDock } from './dock/CanvasDock'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { selectWorkflowCanvasNodes } from '../store/canvas-selection-actions'
import { isIgnoredCanvasTarget, isReactFlowPaneTarget } from '../utils/canvas-dom-scope'
import { useWorkflowFlowHandlers } from '../react-flow/use-workflow-flow-handlers'
import { publishLocalSelection } from '../sync/workflow-presence'
import { recordCanvasProfilerCommit } from '../diagnostics/canvas-profiler-marks'
import { useFlowRenderStore } from '../render/flow-render-store'
import { getFlowPerformancePolicy } from '../render/flow-performance-policy'
import { useWorkflowRuntimeStore } from '../store/workflow-runtime-store'
import { useCanvasStore } from '../store/canvas-store'
import { useCanvasEdgeCount, useCanvasMediaNodeCount, useCanvasNodeCount } from '../store/selectors'
import {
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

const getMiniMapNodeColor = (node: WorkflowFlowNode): string => {
  switch (node.type) {
    case 'image_generation':
      return 'oklch(0.62 0.055 210)'
    case 'video_generation':
      return 'oklch(0.58 0.05 286)'
    case 'text':
      return 'oklch(0.72 0.018 247)'
    case 'flow_group':
      return 'oklch(0.64 0.035 155)'
    case 'node_group':
      return 'oklch(0.68 0.026 80)'
    default:
      return 'var(--foreground-quaternary)'
  }
}

export function WorkflowCanvas({ onRunNode, onSelectOutput, runError, runningNodeId }: WorkflowCanvasProps) {
  useHydrateFlowRender()
  const flowNodes = useFlowRenderStore((state) => state.flowNodes)
  const flowEdges = useFlowRenderStore((state) => state.flowEdges)
  const nodeCount = useCanvasNodeCount()
  const edgeCount = useCanvasEdgeCount()
  const mediaNodeCount = useCanvasMediaNodeCount()
  const setRuntime = useWorkflowRuntimeStore((state) => state.setRuntime)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  const closeNodePanel = useCanvasUiStore((state) => state.closeNodePanel)
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
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pointerFrameRef = useRef<number | undefined>(undefined)
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

  useEffect(
    () => () => {
      if (pointerFrameRef.current !== undefined) {
        window.cancelAnimationFrame(pointerFrameRef.current)
      }
    },
    [],
  )

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return
    }
    window.__minaWorkflowCanvasUi = {
      get activeNodePanel() {
        return useCanvasUiStore.getState().activeNodePanel
      },
      get selectedNodeIds() {
        return useCanvasUiStore.getState().selectedNodeIds
      },
    }
    return () => {
      delete window.__minaWorkflowCanvasUi
    }
  }, [])

  const handleNodeClick = useCallback<NodeMouseHandler<WorkflowFlowNode>>((event, node) => {
    if (isIgnoredCanvasTarget(event.target)) {
      return
    }
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return
    }
    openNodePanel(node.id, 'config')
  }, [openNodePanel])
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (isReactFlowPaneTarget(event.target)) {
        closeNodePanel()
        selectWorkflowCanvasNodes([])
      }
    },
    [closeNodePanel],
  )
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] }) => {
      const nodeIds = selectedNodes.map((node) => node.id)
      selectWorkflowCanvasNodes(nodeIds)
      publishLocalSelection({
        edgeIds: selectedEdges.map((edge) => edge.id),
        nodeIds,
      })
    },
    [],
  )
  const handleConnectStart = useCallback(() => {
    stageRef.current?.setAttribute('data-connecting', '')
  }, [])
  const handleConnectEnd = useCallback(() => {
    stageRef.current?.removeAttribute('data-connecting')
  }, [])
  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const stage = event.currentTarget
    const rect = stage.getBoundingClientRect()
    const pointerX = event.clientX - rect.left
    const pointerY = event.clientY - rect.top

    if (pointerFrameRef.current !== undefined) {
      window.cancelAnimationFrame(pointerFrameRef.current)
    }

    pointerFrameRef.current = window.requestAnimationFrame(() => {
      stage.style.setProperty('--mina-canvas-pointer-x', `${pointerX}px`)
      stage.style.setProperty('--mina-canvas-pointer-y', `${pointerY}px`)
      stage.setAttribute('data-pointer-active', 'true')
      pointerFrameRef.current = undefined
    })
  }, [])
  const handlePointerLeave = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (pointerFrameRef.current !== undefined) {
      window.cancelAnimationFrame(pointerFrameRef.current)
      pointerFrameRef.current = undefined
    }
    event.currentTarget.removeAttribute('data-pointer-active')
  }, [])

  return (
    <ReactFlowProvider>
      <Profiler id="WorkflowCanvas" onRender={recordCanvasProfilerCommit}>
        <div
          className="mina-wc-flow-shell h-full w-full"
          onPointerLeave={handlePointerLeave}
          onPointerMove={handlePointerMove}
          ref={stageRef}
          style={WORKFLOW_CANVAS_GEOMETRY_CSS_VARS}
        >
          <div aria-hidden="true" className="mina-wc-canvas-background" />
          <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
            connectionLineComponent={WorkflowConnectionLine}
            connectionMode={ConnectionMode.Loose}
            connectionRadius={WORKFLOW_CONNECTION_GEOMETRY.radius}
            edgeTypes={edgeTypes}
            edges={flowEdges}
            fitView
            isValidConnection={isValidConnection}
            multiSelectionKeyCode="Control"
            nodes={flowNodes}
            nodeTypes={nodeTypes}
            onConnect={onConnect}
            onConnectEnd={handleConnectEnd}
            onConnectStart={handleConnectStart}
            onEdgesChange={onEdgesChange}
            onMove={onMove}
            onMoveEnd={onMoveEnd}
            onMoveStart={onMoveStart}
            onNodeClick={handleNodeClick}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onNodesChange={onNodesChange}
            onPaneClick={handlePaneClick}
            onSelectionChange={handleSelectionChange}
            onSelectionDragStart={onSelectionDragStart}
            onSelectionDragStop={onSelectionDragStop}
            onlyRenderVisibleElements={performancePolicy.onlyRenderVisibleElements}
            selectNodesOnDrag={false}
          >
            <Background
              className="mina-wc-react-flow-background"
              color="var(--canvas-dot)"
              gap={24}
              size={1.2}
              variant={BackgroundVariant.Dots}
            />
            <Controls className="mina-wc-controls" position="bottom-right" showInteractive={false} />
            {shouldRenderMiniMapFallback ? (
              <Panel className="mina-wc-minimap-fallback-panel" position="bottom-right">
                <div className="mina-wc-minimap-frame">
                  <div className="mina-wc-minimap-fallback" role="status">
                    <span className="mina-wc-minimap-fallback-label">MiniMap suspended</span>
                    <strong>{nodeCount.toLocaleString()}</strong>
                    <span>Nodes</span>
                  </div>
                </div>
              </Panel>
            ) : (
              <MiniMap
                className="mina-wc-minimap"
                maskColor="color-mix(in oklch, var(--surface-container-lowest) 72%, transparent)"
                nodeColor={getMiniMapNodeColor}
                pannable={isMiniMapInteractive}
                position="bottom-right"
                zoomable={isMiniMapInteractive}
              />
            )}
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

declare global {
  interface Window {
    __minaWorkflowCanvasUi?: {
      activeNodePanel: { nodeId: string; panel: string } | undefined
      selectedNodeIds: string[]
    }
  }
}
