import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { isMediaGenerationNode } from '../domain/canvas-node-types'

export interface FlowPerformancePolicyInput {
  edges: readonly WorkflowCanvasEdge[]
  nodes: readonly WorkflowCanvasNode[]
}

export interface FlowPerformancePolicy {
  onlyRenderVisibleElements: boolean
}

const MEDIA_NODE_WEIGHT = 3
const EDGE_WEIGHT = 1
const NODE_WEIGHT = 1
const VISIBLE_RENDERING_SCORE_THRESHOLD = 320

export const flowPerformanceScore = ({ edges, nodes }: FlowPerformancePolicyInput): number => {
  const mediaNodeCount = nodes.filter(isMediaGenerationNode).length
  return nodes.length * NODE_WEIGHT + edges.length * EDGE_WEIGHT + mediaNodeCount * MEDIA_NODE_WEIGHT
}

export const getFlowPerformancePolicy = (input: FlowPerformancePolicyInput): FlowPerformancePolicy => ({
  onlyRenderVisibleElements: flowPerformanceScore(input) >= VISIBLE_RENDERING_SCORE_THRESHOLD,
})
