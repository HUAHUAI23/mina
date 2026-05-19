import { memo, useCallback, useMemo } from 'react'
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
import { toFlowEdge, toFlowNode } from '../react-flow/flow-adapters'
import { useWorkflowFlowHandlers } from '../react-flow/use-workflow-flow-handlers'
import type {
  WorkflowFlowEdge,
  WorkflowFlowNode,
  WorkflowFlowEdgeTypes,
  WorkflowFlowNodeTypes,
  WorkflowNodeRuntime,
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
  const openNodePanel = useCanvasUiStore((state) => state.openNodePanel)
  const closeNodePanel = useCanvasUiStore((state) => state.closeNodePanel)
  const selectNodeIds = useCanvasUiStore((state) => state.selectNodeIds)
  const { onConnect, onEdgesChange, onNodesChange } = useWorkflowFlowHandlers()
  const runtime = useMemo<WorkflowNodeRuntime>(
    () => ({ onRunNode, onSelectOutput, runError, runningNodeId }),
    [onRunNode, onSelectOutput, runError, runningNodeId],
  )
  const flowNodes = useMemo(() => nodes.map((node) => toFlowNode(node, runtime)), [nodes, runtime])
  const flowEdges = useMemo(() => edges.map(toFlowEdge), [edges])
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
    ({ nodes: selectedNodes }: { nodes: WorkflowFlowNode[]; edges: WorkflowFlowEdge[] }) =>
      selectNodeIds(selectedNodes.map((node) => node.id)),
    [selectNodeIds],
  )

  return (
    <ReactFlowProvider>
      <ReactFlow<WorkflowFlowNode, WorkflowFlowEdge>
        edgeTypes={edgeTypes}
        edges={flowEdges}
        fitView
        nodes={flowNodes}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodesChange={onNodesChange}
        onPaneClick={handlePaneClick}
        onSelectionChange={handleSelectionChange}
        onlyRenderVisibleElements
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
        <NodePanelLayer onRunNode={onRunNode} runError={runError} runningNodeId={runningNodeId} />
      </ReactFlow>
    </ReactFlowProvider>
  )
}

export const MemoizedWorkflowCanvas = memo(WorkflowCanvas)
