import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

export const createStoreId = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID()}`

export const indexNodes = (
  nodes: readonly WorkflowCanvasNode[],
): Record<string, number> =>
  Object.fromEntries(nodes.map((node, index) => [node.id, index]))

export const findNodeById = (
  state: { nodeIndexById: Record<string, number>; nodes: readonly WorkflowCanvasNode[] },
  nodeId: string,
): WorkflowCanvasNode | undefined => {
  const index = state.nodeIndexById[nodeId]
  return index === undefined ? undefined : state.nodes[index]
}
