import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import { toFlowEdge, toFlowNode } from '../react-flow/flow-adapters'
import type { WorkflowFlowEdge, WorkflowFlowNode } from '../domain/flow-types'

interface CachedNodeProjection {
  flowNode: WorkflowFlowNode
  signature: string
}

interface CachedEdgeProjection {
  flowEdge: WorkflowFlowEdge
  signature: string
}

const stableJson = (value: unknown): string => JSON.stringify(value)

const nodeProjectionSignature = (node: WorkflowCanvasNode): string =>
  stableJson({
    data: node.data,
    extent: node.extent,
    height: node.height,
    parentId: node.parentId,
    position: node.position,
    type: node.type,
    width: node.width,
  })

const edgeProjectionSignature = (edge: WorkflowCanvasEdge): string =>
  stableJson({
    data: edge.data,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    type: edge.type,
  })

export class FlowProjectionCache {
  #edgeOrderSignature = ''
  #edges: WorkflowFlowEdge[] = []
  #edgesById = new Map<string, CachedEdgeProjection>()
  #nodeOrderSignature = ''
  #nodes: WorkflowFlowNode[] = []
  #nodesById = new Map<string, CachedNodeProjection>()

  projectGraph(input: {
    edges: readonly WorkflowCanvasEdge[]
    nodes: readonly WorkflowCanvasNode[]
  }): { edges: WorkflowFlowEdge[]; nodes: WorkflowFlowNode[] } {
    const nodeOrderSignature = input.nodes.map((node) => node.id).join('\u001f')
    const edgeOrderSignature = input.edges.map((edge) => edge.id).join('\u001f')

    let nodesChanged = nodeOrderSignature !== this.#nodeOrderSignature
    const nextNodeIds = new Set<string>()
    const nextNodesById = new Map<string, CachedNodeProjection>()
    for (const node of input.nodes) {
      nextNodeIds.add(node.id)
      const signature = nodeProjectionSignature(node)
      const cached = this.#nodesById.get(node.id)
      if (cached?.signature === signature) {
        nextNodesById.set(node.id, cached)
        continue
      }
      nodesChanged = true
      nextNodesById.set(node.id, { flowNode: toFlowNode(node), signature })
    }
    if (!nodesChanged && nextNodeIds.size !== this.#nodesById.size) {
      nodesChanged = true
    }
    this.#nodesById = nextNodesById
    this.#nodeOrderSignature = nodeOrderSignature
    if (nodesChanged) {
      this.#nodes = input.nodes
        .map((node) => this.#nodesById.get(node.id)?.flowNode)
        .filter((node): node is WorkflowFlowNode => Boolean(node))
    }

    let edgesChanged = edgeOrderSignature !== this.#edgeOrderSignature
    const nextEdgeIds = new Set<string>()
    const nextEdgesById = new Map<string, CachedEdgeProjection>()
    for (const edge of input.edges) {
      nextEdgeIds.add(edge.id)
      const signature = edgeProjectionSignature(edge)
      const cached = this.#edgesById.get(edge.id)
      if (cached?.signature === signature) {
        nextEdgesById.set(edge.id, cached)
        continue
      }
      edgesChanged = true
      nextEdgesById.set(edge.id, { flowEdge: toFlowEdge(edge), signature })
    }
    if (!edgesChanged && nextEdgeIds.size !== this.#edgesById.size) {
      edgesChanged = true
    }
    this.#edgesById = nextEdgesById
    this.#edgeOrderSignature = edgeOrderSignature
    if (edgesChanged) {
      this.#edges = input.edges
        .map((edge) => this.#edgesById.get(edge.id)?.flowEdge)
        .filter((edge): edge is WorkflowFlowEdge => Boolean(edge))
    }

    return { edges: this.#edges, nodes: this.#nodes }
  }
}

export const flowProjectionCache = new FlowProjectionCache()
