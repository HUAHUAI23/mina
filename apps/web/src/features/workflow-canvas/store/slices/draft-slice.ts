import type {
  CanvasDraftActions,
  CanvasDraftState,
  CanvasSliceCreator,
} from '../store-types'

export const initialDraftState: CanvasDraftState = {
  version: 1,
  yjsConnectionStatus: 'connecting',
}

export const createDraftSlice: CanvasSliceCreator<
  CanvasDraftState & CanvasDraftActions
> = (set) => ({
  ...initialDraftState,
  setYjsConnectionStatus: (yjsConnectionStatus) => set({ yjsConnectionStatus }),
})
