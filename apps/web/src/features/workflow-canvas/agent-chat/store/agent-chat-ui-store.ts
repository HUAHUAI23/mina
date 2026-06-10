import type { MediaObject } from '@mina/contracts/modules/media/media-object'
import { create } from 'zustand'

export interface AgentChatDraftAttachment {
  error?: string | undefined
  file?: File | undefined
  fileName: string
  id: string
  mediaObject?: MediaObject | undefined
  mimeType: string
  size: number
  status: 'uploading' | 'ready' | 'error'
}

interface AgentChatUiState {
  composerOpen: boolean
  draftAttachments: AgentChatDraftAttachment[]
  draftText: string
  messageCardOpen: boolean
}

interface AgentChatUiActions {
  addDraftAttachment(attachment: AgentChatDraftAttachment): void
  clearDraft(): void
  closeAll(): void
  closeComposer(): void
  openChat(): void
  removeDraftAttachment(id: string): void
  setDraftText(value: string): void
  updateDraftAttachment(id: string, patch: Partial<AgentChatDraftAttachment>): void
}

type AgentChatUiStore = AgentChatUiState & AgentChatUiActions

export const useAgentChatUiStore = create<AgentChatUiStore>((set) => ({
  composerOpen: false,
  draftAttachments: [],
  draftText: '',
  messageCardOpen: false,
  addDraftAttachment: (attachment) =>
    set((state) => ({
      draftAttachments: [...state.draftAttachments, attachment],
    })),
  clearDraft: () => set({ draftAttachments: [], draftText: '' }),
  closeAll: () => set({ composerOpen: false, messageCardOpen: false }),
  closeComposer: () => set({ composerOpen: false }),
  openChat: () => set({ composerOpen: true, messageCardOpen: true }),
  removeDraftAttachment: (id) =>
    set((state) => ({
      draftAttachments: state.draftAttachments.filter((attachment) => attachment.id !== id),
    })),
  setDraftText: (draftText) => set({ draftText }),
  updateDraftAttachment: (id, patch) =>
    set((state) => ({
      draftAttachments: state.draftAttachments.map((attachment) =>
        attachment.id === id ? { ...attachment, ...patch } : attachment
      ),
    })),
}))
