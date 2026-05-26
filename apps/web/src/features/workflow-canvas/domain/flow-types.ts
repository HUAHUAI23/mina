import type { ComponentType } from 'react'
import type { Edge, EdgeProps, Node, NodeProps } from '@xyflow/react'
import type {
  NodeMediaViewState,
  WorkflowCanvasEdge,
} from '@mina/contracts/modules/canvas'

interface WorkflowFlowEdgeData extends Record<string, unknown> {
  connection?: WorkflowCanvasEdge['data']['connection'] | undefined
}

type WorkflowFlowNodeDataBase = {
  nodeId: string
  title: string
}

export type ImageGenerationFlowNodeData = WorkflowFlowNodeDataBase & {
  mediaView?: NodeMediaViewState | undefined
  nodeType: 'image_generation'
}

export type VideoGenerationFlowNodeData = WorkflowFlowNodeDataBase & {
  mediaView?: NodeMediaViewState | undefined
  nodeType: 'video_generation'
}

export type TextFlowNodeData = WorkflowFlowNodeDataBase & {
  nodeType: 'text'
  textPreview: string
}

export type FlowGroupFlowNodeData = WorkflowFlowNodeDataBase & {
  nodeType: 'flow_group'
}

export type NodeGroupFlowNodeData = WorkflowFlowNodeDataBase & {
  nodeType: 'node_group'
}

export type WorkflowFlowNodeData =
  | ImageGenerationFlowNodeData
  | VideoGenerationFlowNodeData
  | TextFlowNodeData
  | FlowGroupFlowNodeData
  | NodeGroupFlowNodeData

export type ImageGenerationFlowNode = Node<ImageGenerationFlowNodeData, 'image_generation'>

export type VideoGenerationFlowNode = Node<VideoGenerationFlowNodeData, 'video_generation'>

export type TextFlowNode = Node<TextFlowNodeData, 'text'>

export type FlowGroupFlowNode = Node<FlowGroupFlowNodeData, 'flow_group'>

export type NodeGroupFlowNode = Node<NodeGroupFlowNodeData, 'node_group'>

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
  image_generation: WorkflowFlowNodeComponent<ImageGenerationFlowNode>
  node_group: WorkflowFlowNodeComponent<NodeGroupFlowNode>
  text: WorkflowFlowNodeComponent<TextFlowNode>
  video_generation: WorkflowFlowNodeComponent<VideoGenerationFlowNode>
}

export type WorkflowFlowEdgeTypes = {
  media: ComponentType<EdgeProps<WorkflowFlowEdge>>
}
