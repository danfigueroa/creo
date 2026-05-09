import type { GlyphKind } from '@/components/glyph'

// UI tradition surface. The backend only persists CATHOLIC | EVANGELICAL today;
// 'BOTH' and 'NONE' are TS-side only and are saved as 'CATHOLIC' until the
// backend ships the new enum values.
export type Tradition = 'CATHOLIC' | 'EVANGELICAL' | 'BOTH' | 'NONE'

export type SavedTradition = 'CATHOLIC' | 'EVANGELICAL'

export type PrayerAction = {
  type: string
  emoji: string
  label: string
  glyph: GlyphKind
  // which traditions can see + post this reaction (UI filter)
  denoms: Tradition[]
  bg: string
  border: string
  fg: string
  dot: string
}

// Single source of truth — 5 catholic + 5 evangelical reactions. Each carries
// the glyph + oklch palette from the design and an explicit list of traditions
// that should see it. OUR_FATHER and GLORY_BE read as universal Christian
// prayers, so they're shared with NONE too.
const ACTIONS: PrayerAction[] = [
  {
    type: 'HAIL_MARY',
    emoji: '🙏',
    label: 'Ave Maria',
    glyph: 'rose',
    denoms: ['CATHOLIC', 'BOTH'],
    bg: 'oklch(0.94 0.03 25)',
    border: 'oklch(0.86 0.06 25)',
    fg: 'oklch(0.42 0.10 25)',
    dot: 'oklch(0.68 0.14 25)'
  },
  {
    type: 'OUR_FATHER',
    emoji: '✝️',
    label: 'Pai Nosso',
    glyph: 'sun',
    denoms: ['CATHOLIC', 'BOTH', 'NONE'],
    bg: 'oklch(0.94 0.03 75)',
    border: 'oklch(0.86 0.06 75)',
    fg: 'oklch(0.42 0.10 75)',
    dot: 'oklch(0.70 0.13 75)'
  },
  {
    type: 'GLORY_BE',
    emoji: '✨',
    label: 'Glória',
    glyph: 'diamond',
    denoms: ['CATHOLIC', 'BOTH', 'NONE'],
    bg: 'oklch(0.95 0.04 95)',
    border: 'oklch(0.86 0.08 95)',
    fg: 'oklch(0.45 0.10 95)',
    dot: 'oklch(0.74 0.14 95)'
  },
  {
    type: 'ROSARY_DECADE',
    emoji: '📿',
    label: 'Terço',
    glyph: 'beads',
    denoms: ['CATHOLIC', 'BOTH'],
    bg: 'oklch(0.94 0.03 145)',
    border: 'oklch(0.84 0.05 145)',
    fg: 'oklch(0.40 0.07 145)',
    dot: 'oklch(0.62 0.09 145)'
  },
  {
    type: 'ROSARY_FULL',
    emoji: '🕊️',
    label: 'Rosário',
    glyph: 'ring',
    denoms: ['CATHOLIC', 'BOTH'],
    bg: 'oklch(0.94 0.03 340)',
    border: 'oklch(0.85 0.05 340)',
    fg: 'oklch(0.42 0.09 340)',
    dot: 'oklch(0.68 0.10 340)'
  },
  {
    type: 'I_PRAYED',
    emoji: '🙏',
    label: 'Orei',
    glyph: 'rose',
    denoms: ['EVANGELICAL', 'BOTH'],
    bg: 'oklch(0.94 0.03 25)',
    border: 'oklch(0.86 0.06 25)',
    fg: 'oklch(0.42 0.10 25)',
    dot: 'oklch(0.68 0.14 25)'
  },
  {
    type: 'INTERCESSION',
    emoji: '🤲',
    label: 'Intercedi',
    glyph: 'sun',
    denoms: ['EVANGELICAL', 'BOTH'],
    bg: 'oklch(0.94 0.03 220)',
    border: 'oklch(0.85 0.05 220)',
    fg: 'oklch(0.40 0.08 220)',
    dot: 'oklch(0.66 0.11 220)'
  },
  {
    type: 'GRATITUDE',
    emoji: '🙌',
    label: 'Gratidão',
    glyph: 'diamond',
    denoms: ['EVANGELICAL', 'BOTH'],
    bg: 'oklch(0.95 0.04 60)',
    border: 'oklch(0.86 0.08 60)',
    fg: 'oklch(0.45 0.10 60)',
    dot: 'oklch(0.72 0.14 60)'
  },
  {
    type: 'FASTING',
    emoji: '🌾',
    label: 'Jejum',
    glyph: 'beads',
    denoms: ['EVANGELICAL', 'BOTH'],
    bg: 'oklch(0.94 0.03 145)',
    border: 'oklch(0.84 0.05 145)',
    fg: 'oklch(0.40 0.07 145)',
    dot: 'oklch(0.62 0.09 145)'
  },
  {
    type: 'CRYING_OUT',
    emoji: '🔥',
    label: 'Clamor',
    glyph: 'ring',
    denoms: ['EVANGELICAL', 'BOTH'],
    bg: 'oklch(0.94 0.03 340)',
    border: 'oklch(0.85 0.05 340)',
    fg: 'oklch(0.42 0.09 340)',
    dot: 'oklch(0.68 0.10 340)'
  }
]

export function prayerActionsFor(tradition: Tradition | undefined | null): PrayerAction[] {
  const t = tradition || 'CATHOLIC'
  return ACTIONS.filter((a) => a.denoms.includes(t))
}

// Maps any UI tradition to a value the backend currently accepts.
// BOTH/NONE collapse to CATHOLIC until the backend ships the new enum values.
export function toSavedTradition(tradition: Tradition): SavedTradition {
  return tradition === 'EVANGELICAL' ? 'EVANGELICAL' : 'CATHOLIC'
}

export const traditionLabel: Record<Tradition, string> = {
  CATHOLIC: 'Católico(a)',
  EVANGELICAL: 'Evangélico(a)',
  BOTH: 'Ecumênico',
  NONE: 'Não praticante'
}

export type TraditionOption = {
  value: Tradition
  label: string
  description: string
  emoji: string
}

export const traditionOptions: TraditionOption[] = [
  {
    value: 'CATHOLIC',
    label: 'Católico(a)',
    description: 'Ave Maria, Pai Nosso, Glória, Terço e Rosário',
    emoji: '📿'
  },
  {
    value: 'EVANGELICAL',
    label: 'Evangélico(a)',
    description: 'Orei, Intercessão, Gratidão, Jejum e Clamor',
    emoji: '🕊️'
  },
  {
    value: 'BOTH',
    label: 'Ecumênico',
    description: 'Mostra todas as formas de oração',
    emoji: '✝️'
  },
  {
    value: 'NONE',
    label: 'Não praticante',
    description: 'Apenas Pai Nosso e Glória',
    emoji: '🌱'
  }
]
