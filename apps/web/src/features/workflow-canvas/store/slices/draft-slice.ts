import { produce } from 'immer'

import { markDraftChanged } from '../store-helpers'
import type {
  CanvasStore,
  CanvasDraftActions,
  CanvasDraftState,
  CanvasSliceCreator,
} from '../store-types'

export const initialDraftState: CanvasDraftState = {
  dirty: false,
  draftRevision: 0,
  lastDocumentTransaction: undefined,
  savedRevision: 0,
  saving: false,
  version: 1,
}

export const createDraftSlice: CanvasSliceCreator<
  CanvasDraftState & CanvasDraftActions
> = (set) => ({
  ...initialDraftState,
  acknowledgeSaved: ({ revision, version }) =>
    set(
      produce<CanvasStore>((state) => {
        state.version = version
        state.saving = false
        if (state.draftRevision === revision) {
          state.dirty = false
          state.savedRevision = revision
          state.remoteUpdatePending = false
          state.remoteVersion = undefined
        }
      }),
    ),
  markDraftChanged: () =>
    set(
      produce<CanvasStore>((state) => {
        markDraftChanged(state)
      }),
    ),
  setSaving: (saving) => set({ saving }),
})
