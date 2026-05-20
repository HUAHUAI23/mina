import { produce } from 'immer'

import type {
  CanvasStore,
  CanvasDraftActions,
  CanvasDraftState,
  CanvasSliceCreator,
} from '../store-types'

export const initialDraftState: CanvasDraftState = {
  dirty: false,
  saving: false,
  version: 1,
  yjsConnectionStatus: 'connecting',
}

export const createDraftSlice: CanvasSliceCreator<
  CanvasDraftState & CanvasDraftActions
> = (set) => ({
  ...initialDraftState,
  acknowledgeSaved: ({ version }) =>
    set(
      produce<CanvasStore>((state) => {
        state.version = version
        state.saving = false
        state.dirty = false
      }),
    ),
  markDraftChanged: () =>
    set(
      produce<CanvasStore>((state) => {
        state.dirty = true
      }),
    ),
  setSaving: (saving) => set({ saving }),
  setYjsConnectionStatus: (yjsConnectionStatus) => set({ yjsConnectionStatus }),
})
