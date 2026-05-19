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
  hydrateFromServer: (input) =>
    set((state) => {
      if (state.hydratedWorkflowId === input.workflowId && state.dirty) {
        return state
      }
      return {
        ...state,
        dirty: false,
        draftRevision: 0,
        edges: input.edges,
        hydratedWorkflowId: input.workflowId,
        name: input.name,
        nodeIndexById: indexNodes(input.nodes),
        nodes: input.nodes,
        remoteUpdatePending: false,
        remoteVersion: undefined,
        savedRevision: 0,
        saving: false,
        version: input.version,
        workflowId: input.workflowId,
      }
    }),
})
