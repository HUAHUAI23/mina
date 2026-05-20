import { Profiler, memo, useCallback, useEffect, useMemo } from 'react'
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import type { NodeMouseHandler } from '@xyflow/react'

import { MediaEdge } from './edges/MediaEdge'
import { FlowGroupNode } from './nodes/FlowGroupNode'
import { MediaGenerationNode } from './nodes/MediaGenerationNode/MediaGenerationNode'
import { NodeGroupNode } from './nodes/NodeGroupNode'
import { TextNode } from './nodes/TextNode'
import { NodePanelLayer } from './panels/NodePanelLayer'
import { useCanvasUiStore } from '../store/canvas-ui-store'
import { useCanvasEdges, useCanvasNodes } from '../store/selectors'
import { isIgnoredCanvasTarget, isReactFlowPaneTarget } from '../utils/canvas-dom-scope'
import { useWorkflowFlowHandlers } from '../react-flow/use-workflow-flow-handlers'
import { publishLocalSelection } from '../sync/workflow-presence'
import { recordCanvasProfilerCommit } from '../diagnostics/canvas-profiler-marks'
import { useFlowRenderStore } from '../render/flow-render-store'
import { useWorkflowRuntimeStore } from '../store/workflow-runtime-store'
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
  image_generation: MediaGenerationNode,
  video_generation: MediaGenerationNode,
  text: TextNode,
  flow_group: FlowGroupNode,
  node_group: NodeGroupNode,
} satisfies WorkflowFlowNodeTypes

export function WorkflowCanvas({ onRunNode, onSelectOutput, runError, runningNodeId }: WorkflowCanvasProps) {
  const nodes = useCanvasNodes()
  const edges = useCanvasEdges()
  const flowNodes = useFlowRenderStore((state) => state.flowNodes)
  const flowEdges = useFlowRenderStore((state) => state.flowEdges)
  const hydrateRenderFromDocument = useFlowRenderStore((state) => state.hydrateFromDocument)
  const setRuntime = useWorkflowRuntimeStore((state) => state.setRuntime)
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  const closeNodePanel = useCanvasUiStore((state) => state.closeNodePanel)
  const selectNodeIds = useCanvasUiStore((state) => state.selectNodeIds)
  const {
    onConnect,
    onEdgesChange,
    onMove,
    onMoveEnd,
    onMoveStart,
    onNodeDragStart,
    onNodeDragStop,
    onNodesChange,
  } = useWorkflowFlowHandlers()
  const runtimeActions = useMemo(
    () => ({ onRunNode, onSelectOutput }),
    [onRunNode, onSelectOutput],
  )

  useEffect(() => {
    hydrateRenderFromDocument({ edges, nodes })
  }, [edges, hydrateRenderFromDocument, nodes])

  useEffect(() => {
    setRuntime({ actions: runtimeActions, runError, runningNodeId })
  }, [runError, runningNodeId, runtimeActions, setRuntime])

  const handleNodeClick = useCallback<NodeMouseHandler<WorkflowFlowNode>>((event, node) => {
    if (isIgnoredCanvasTarget(event.target)) {
      return
    }
    openNodePanel(node.id, 'config')
  }, [openNodePanel])
  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (isReactFlowPaneTarget(event.target)) {
        closeNodePanel()
      }
    },
    [closeNodePanel],
  )
  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes, edges: selectedEdges }: { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] }) => {
      const nodeIds = selectedNodes.map((node) => node.id)
      selectNodeIds(nodeIds)
      publishLocalSelection({
        edgeIds: selectedEdges.map((edge) => edge.id),
        nodeIds,
      })
    },
    [selectNodeIds],
  )

  return (
    <ReactFlowProvider>
      <Profiler id="WorkflowCanvas" onRender={recordCanvasProfilerCommit}>
        <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
          edgeTypes={edgeTypes}
          edges={flowEdges}
          fitView
          nodes={flowNodes}
          nodeTypes={nodeTypes}
          onConnect={onConnect}
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
          onlyRenderVisibleElements={nodes.length >= 500}
        >
          <Background gap={24} size={1} />
          <Controls showInteractive={false} />
          <NodePanelLayer onRunNode={onRunNode} runError={runError} runningNodeId={runningNodeId} />
        </ReactFlow>
      </Profiler>
    </ReactFlowProvider>
  )
}

export const MemoizedWorkflowCanvas = memo(WorkflowCanvas)
