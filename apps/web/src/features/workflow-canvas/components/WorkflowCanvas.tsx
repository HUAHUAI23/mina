import { memo, useMemo } from 'react'
import { Background, Controls, ReactFlow, ReactFlowProvider } from '@xyflow/react'
import type { Edge, EdgeTypes, Node, NodeTypes } from '@xyflow/react'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { MediaEdge } from './edges/MediaEdge'
import { FlowGroupNode } from './nodes/FlowGroupNode'
import { MediaGenerationNode } from './nodes/MediaGenerationNode/MediaGenerationNode'
import { NodeGroupNode } from './nodes/NodeGroupNode'
import { TextNode } from './nodes/TextNode'
import { useCanvasStore } from '../store/canvas-store'

interface WorkflowCanvasProps {
  onSelectOutput(nodeId: string, taskId: string, outputResourceId: string, outputIndex: number): void
}

const edgeTypes: EdgeTypes = {
  media: MediaEdge,
}

const toFlowNode = (node: WorkflowCanvasNode): Node => ({
  id: node.id,
  type: node.type,
  position: node.position,
  data: node.data as unknown as Record<string, unknown>,
  ...(node.parentId ? { parentId: node.parentId } : {}),
  ...(node.extent ? { extent: node.extent } : {}),
  ...(node.width !== undefined ? { width: node.width } : {}),
  ...(node.height !== undefined ? { height: node.height } : {}),
})

const toFlowEdge = (edge: WorkflowCanvasEdge): Edge => ({
  id: edge.id,
  type: edge.type,
  source: edge.source,
  target: edge.target,
  sourceHandle: edge.sourceHandle ?? null,
  targetHandle: edge.targetHandle ?? null,
  data: edge.data as unknown as Record<string, unknown>,
})

const createMediaNode = (
  onSelectOutput: WorkflowCanvasProps['onSelectOutput'],
): NonNullable<NodeTypes[string]> =>
  function MediaNode(props) {
    return <MediaGenerationNode {...props} onSelectOutput={onSelectOutput} />
  }

export function WorkflowCanvas({ onSelectOutput }: WorkflowCanvasProps) {
  const nodes = useCanvasStore((state) => state.nodes)
  const edges = useCanvasStore((state) => state.edges)
  const onNodesChange = useCanvasStore((state) => state.onNodesChange)
  const onEdgesChange = useCanvasStore((state) => state.onEdgesChange)
  const onConnect = useCanvasStore((state) => state.onConnect)
  const nodeTypes = useMemo<NodeTypes>(
    () => ({
      image_generation: createMediaNode(onSelectOutput),
      video_generation: createMediaNode(onSelectOutput),
      text: TextNode,
      flow_group: FlowGroupNode,
      node_group: NodeGroupNode,
    }),
    [onSelectOutput],
  )
  const flowNodes = useMemo(() => nodes.map(toFlowNode), [nodes])
  const flowEdges = useMemo(() => edges.map(toFlowEdge), [edges])

  return (
    <ReactFlowProvider>
      <ReactFlow
        edgeTypes={edgeTypes}
        edges={flowEdges}
        fitView
        nodes={flowNodes}
        nodeTypes={nodeTypes}
        onConnect={onConnect}
        onEdgesChange={onEdgesChange}
        onNodesChange={onNodesChange}
        onlyRenderVisibleElements
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </ReactFlowProvider>
  )
}

export const MemoizedWorkflowCanvas = memo(WorkflowCanvas)
