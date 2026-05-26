export interface FlowPerformancePolicyInput {
  edgeCount: number
  mediaNodeCount: number
  nodeCount: number
}

interface LegacyFlowPerformancePolicyInput {
  edges: readonly unknown[]
  nodes: readonly { data?: { nodeType?: unknown } }[]
}

export interface FlowPerformancePolicy {
  onlyRenderVisibleElements: boolean
}

const MEDIA_NODE_WEIGHT = 3
const EDGE_WEIGHT = 1
const NODE_WEIGHT = 1
const VISIBLE_RENDERING_SCORE_THRESHOLD = 320

const normalizePolicyInput = (
  input: FlowPerformancePolicyInput | LegacyFlowPerformancePolicyInput,
): FlowPerformancePolicyInput => {
  if ('nodeCount' in input) {
    return input
  }
  return {
    edgeCount: input.edges.length,
    mediaNodeCount: input.nodes.filter((node) => node.data?.nodeType === 'image_generation' || node.data?.nodeType === 'video_generation').length,
    nodeCount: input.nodes.length,
  }
}

export const flowPerformanceScore = (input: FlowPerformancePolicyInput | LegacyFlowPerformancePolicyInput): number => {
  const { edgeCount, mediaNodeCount, nodeCount } = normalizePolicyInput(input)
  return nodeCount * NODE_WEIGHT + edgeCount * EDGE_WEIGHT + mediaNodeCount * MEDIA_NODE_WEIGHT
}

export const getFlowPerformancePolicy = (input: FlowPerformancePolicyInput | LegacyFlowPerformancePolicyInput): FlowPerformancePolicy => ({
  onlyRenderVisibleElements: flowPerformanceScore(input) >= VISIBLE_RENDERING_SCORE_THRESHOLD,
})
