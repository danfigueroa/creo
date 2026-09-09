import { create } from 'zustand'
import type { BibleVerse } from '@/components/feed-card'

type Store = {
  open: boolean
  /** Versículo sendo compartilhado. Null enquanto o modal está fechado. */
  verse: BibleVerse | null
  onShared: (() => void) | null
  openVerseComposer: (verse: BibleVerse, onShared?: () => void) => void
  closeVerseComposer: () => void
}

// Store paralela à composer-store: o PageShell monta o único ShareVerseModal e
// qualquer tela abre por aqui, sem montar um segundo modal local.
export const useVerseComposerStore = create<Store>((set) => ({
  open: false,
  verse: null,
  onShared: null,
  openVerseComposer: (verse, onShared) => set({ open: true, verse, onShared: onShared ?? null }),
  closeVerseComposer: () => set({ open: false, verse: null, onShared: null })
}))
