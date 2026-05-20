import { indexNodes } from '../store-helpers'
import type {
  CanvasHydrationActions,
  CanvasHydrationState,
  CanvasSliceCreator,
} from '../store-types'

export const initialHydrationState: CanvasHydrationState = {
  hydratedWorkflowId: undefined,
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
      return {
        ...state,
        edges: input.edges,
        nodeIndexById: indexNodes(input.nodes),
        nodes: input.nodes,
        ...(input.version ? { version: input.version } : {}),
      }
    }),
  hydrateFromServer: (input) =>
    set((state) => {
      if (state.hydratedWorkflowId === input.workflowId && state.dirty) {
        return state
      }
      if (state.hydratedWorkflowId === input.workflowId) {
        return {
          ...state,
          hydratedWorkflowId: input.workflowId,
          name: input.name,
          saving: false,
          version: input.version,
          workflowId: input.workflowId,
        }
      }
      return {
        ...state,
        dirty: false,
        edges: input.edges,
        hydratedWorkflowId: input.workflowId,
        name: input.name,
        nodeIndexById: indexNodes(input.nodes),
        nodes: input.nodes,
        saving: false,
        version: input.version,
        workflowId: input.workflowId,
      }
    }),
})
