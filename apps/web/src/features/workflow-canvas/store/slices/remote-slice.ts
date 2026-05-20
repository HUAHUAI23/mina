import type {
  CanvasRemoteActions,
  CanvasRemoteState,
  CanvasSliceCreator,
} from '../store-types'

export const initialRemoteState: CanvasRemoteState = {}

export const createRemoteSlice: CanvasSliceCreator<
  CanvasRemoteState & CanvasRemoteActions
> = () => ({
  ...initialRemoteState,
})
