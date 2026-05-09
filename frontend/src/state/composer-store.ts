import { create } from 'zustand'

type Store = {
  open: boolean
  defaultGroupId: string | null
  openComposer: (defaultGroupId?: string) => void
  closeComposer: () => void
}

// Lightweight global composer state — the new-intention modal lives at the
// PageShell level so the topbar + the feed compose card + group "Criar pedido"
// can all open it from anywhere.
export const useComposerStore = create<Store>((set) => ({
  open: false,
  defaultGroupId: null,
  openComposer: (defaultGroupId) => set({ open: true, defaultGroupId: defaultGroupId ?? null }),
  closeComposer: () => set({ open: false, defaultGroupId: null })
}))
