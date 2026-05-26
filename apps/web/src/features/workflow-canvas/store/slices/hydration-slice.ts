import { indexNodes } from '../store-helpers'
import type {
  CanvasHydrationActions,
  CanvasHydrationState,
  CanvasSliceCreator,
} from '../store-types'
import type { WorkflowCanvasEdge, WorkflowCanvasNode } from '@mina/contracts/modules/canvas'

export const initialHydrationState: CanvasHydrationState = {
  hydratedWorkflowId: undefined,
}

const stableJson = (value: unknown): string => JSON.stringify(value)

const nodeSignature = (node: WorkflowCanvasNode): string =>
  stableJson({
    data: node.data,
    extent: node.extent,
    height: node.height,
    id: node.id,
    parentId: node.parentId,
    position: node.position,
    type: node.type,
    width: node.width,
  })

const edgeSignature = (edge: WorkflowCanvasEdge): string =>
  stableJson({
    data: edge.data,
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    type: edge.type,
  })

const preserveById = <TItem extends { id: string }>(
  previous: readonly TItem[],
  next: readonly TItem[],
  signature: (item: TItem) => string,
): TItem[] => {
  const previousById = new Map(previous.map((item) => [item.id, item]))
  let changed = previous.length !== next.length
  const preserved = next.map((item, index) => {
    const previousItem = previousById.get(item.id)
    if (previousItem && signature(previousItem) === signature(item)) {
      if (previous[index] !== previousItem) {
        changed = true
      }
      return previousItem
    }
    changed = true
    return item
  })
  return changed ? preserved : (previous as TItem[])
}

export const createHydrationSlice: CanvasSliceCreator<
  CanvasHydrationState & CanvasHydrationActions
> = (set) => ({
  ...initialHydrationState,
  applyRemoteSnapshot: (input) =>
    set((state) => {
      if (state.workflowId !== input.workflowId) {
        return state
      }
      if (
        input.source === 'yjs' &&
        !input.allowEmpty &&
        input.edges.length === 0 &&
        input.nodes.length === 0 &&
        state.nodes.length > 0
      ) {
        return state
      }
      const nodes = preserveById(state.nodes, input.nodes, nodeSignature)
      const edges = preserveById(state.edges, input.edges, edgeSignature)
      return {
        ...state,
        edges,
        nodeIndexById: nodes === state.nodes ? state.nodeIndexById : indexNodes(nodes),
        nodes,
        ...(input.version ? { version: input.version } : {}),
      }
    }),
  hydrateFromServer: (input) =>
    set((state) => {
      if (state.hydratedWorkflowId === input.workflowId) {
        return {
          ...state,
          hydratedWorkflowId: input.workflowId,
          name: input.name,
          version: input.version,
          workflowId: input.workflowId,
        }
      }
      return {
        ...state,
        edges: input.edges,
        hydratedWorkflowId: input.workflowId,
        name: input.name,
        nodeIndexById: indexNodes(input.nodes),
        nodes: input.nodes,
        version: input.version,
        workflowId: input.workflowId,
      }
    }),
})
