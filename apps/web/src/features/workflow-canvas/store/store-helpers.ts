import type { WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

import type { CanvasStore } from './store-types'

export const createStoreId = (prefix: string): string =>
  `${prefix}_${crypto.randomUUID()}`

export const indexNodes = (
  nodes: readonly WorkflowCanvasNode[],
): Record<string, number> =>
  Object.fromEntries(nodes.map((node, index) => [node.id, index]))

export const markDraftChanged = (state: CanvasStore): void => {
  state.dirty = true
  state.draftRevision += 1
}

export const commitDraftChanged = (state: CanvasStore): void => {
  markDraftChanged(state)
  state.nodeIndexById = indexNodes(state.nodes)
}

export const findNodeById = (
  state: Pick<CanvasStore, 'nodeIndexById' | 'nodes'>,
  nodeId: string,
): WorkflowCanvasNode | undefined => {
  const index = state.nodeIndexById[nodeId]
  return index === undefined ? undefined : state.nodes[index]
}
