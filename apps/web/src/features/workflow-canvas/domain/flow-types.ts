import type { ComponentType } from 'react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import type {
  NodeMediaViewState,
  WorkflowCanvasEdge,
  WorkflowNodeType,
} from '@mina/contracts/modules/canvas'

interface WorkflowFlowEdgeData {
  [key: string]: WorkflowCanvasEdge['data']['connection'] | undefined
  connection?: WorkflowCanvasEdge['data']['connection'] | undefined
}

export interface WorkflowFlowNodeData {
  [key: string]: NodeMediaViewState | WorkflowNodeType | string | undefined
  mediaView?: NodeMediaViewState | undefined
  nodeId: string
  nodeType: WorkflowNodeType
  textPreview?: string | undefined
  title: string
}

export type ImageGenerationFlowNode = Node<
  WorkflowFlowNodeData & { nodeType: 'image_generation' },
  'image_generation'
>

export type VideoGenerationFlowNode = Node<
  WorkflowFlowNodeData & { nodeType: 'video_generation' },
  'video_generation'
>

export type TextFlowNode = Node<
  WorkflowFlowNodeData & { nodeType: 'text' },
  'text'
>

export type FlowGroupFlowNode = Node<
  WorkflowFlowNodeData & { nodeType: 'flow_group' },
  'flow_group'
>

export type NodeGroupFlowNode = Node<
  WorkflowFlowNodeData & { nodeType: 'node_group' },
  'node_group'
>

export type WorkflowFlowNode =
  | ImageGenerationFlowNode
  | VideoGenerationFlowNode
  | TextFlowNode
  | FlowGroupFlowNode
  | NodeGroupFlowNode

export type WorkflowFlowEdge = Edge<WorkflowFlowEdgeData, 'media'>

export type WorkflowFlowNodeComponent<TNode extends WorkflowFlowNode> = ComponentType<NodeProps<TNode>>

export type WorkflowFlowNodeTypes = {
  flow_group: WorkflowFlowNodeComponent<FlowGroupFlowNode>
  image_generation: WorkflowFlowNodeComponent<ImageGenerationFlowNode | VideoGenerationFlowNode>
  node_group: WorkflowFlowNodeComponent<NodeGroupFlowNode>
  text: WorkflowFlowNodeComponent<TextFlowNode>
  video_generation: WorkflowFlowNodeComponent<ImageGenerationFlowNode | VideoGenerationFlowNode>
}

export type WorkflowFlowEdgeTypes = {
  media: ComponentType<EdgeProps<WorkflowFlowEdge>>
}
