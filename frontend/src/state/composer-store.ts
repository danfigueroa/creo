import { create } from 'zustand'

type CreatedVisibility = 'GROUP_ONLY' | 'PRIVATE' | 'PUBLIC'

type Store = {
  open: boolean
  defaultGroupId: string | null
  onCreated: ((visibility: CreatedVisibility) => void) | null
  openComposer: (defaultGroupId?: string, onCreated?: (visibility: CreatedVisibility) => void) => void
  closeComposer: () => void
}

// Lightweight global composer state — the new-intention modal lives at the
// PageShell level so the topbar + the feed compose card + group "Criar pedido"
// can all open it from anywhere. `onCreated` lets the caller reagir ao sucesso
// (ex.: o feed navega pra aba correspondente à visibilidade criada).
export const useComposerStore = create<Store>((set) => ({
  open: false,
  defaultGroupId: null,
  onCreated: null,
  openComposer: (defaultGroupId, onCreated) =>
    set({ open: true, defaultGroupId: defaultGroupId ?? null, onCreated: onCreated ?? null }),
  closeComposer: () => set({ open: false, defaultGroupId: null, onCreated: null })
}))
