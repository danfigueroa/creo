import type { GlyphKind } from '@/components/glyph'

export type Tradition = 'CATHOLIC' | 'EVANGELICAL'

export type PrayerAction = {
  type: string
  emoji: string
  label: string
  glyph: GlyphKind
  bg: string
  border: string
  fg: string
  dot: string
}

// Catholic reactions — match the design 1:1.
const catholicActions: PrayerAction[] = [
  {
    type: 'HAIL_MARY',
    emoji: '🙏',
    label: 'Ave Maria',
    glyph: 'rose',
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
    bg: 'oklch(0.94 0.03 340)',
    border: 'oklch(0.85 0.05 340)',
    fg: 'oklch(0.42 0.09 340)',
    dot: 'oklch(0.68 0.10 340)'
  }
]

// Evangelical reactions — same glyph + hue language, own labels.
const evangelicalActions: PrayerAction[] = [
  {
    type: 'I_PRAYED',
    emoji: '🙏',
    label: 'Orei',
    glyph: 'rose',
    bg: 'oklch(0.94 0.03 25)',
    border: 'oklch(0.86 0.06 25)',
    fg: 'oklch(0.42 0.10 25)',
    dot: 'oklch(0.68 0.14 25)'
  },
  {
    type: 'INTERCESSION',
    emoji: '✝️',
    label: 'Intercedi',
    glyph: 'sun',
    bg: 'oklch(0.94 0.03 75)',
    border: 'oklch(0.86 0.06 75)',
    fg: 'oklch(0.42 0.10 75)',
    dot: 'oklch(0.70 0.13 75)'
  },
  {
    type: 'GRATITUDE',
    emoji: '✨',
    label: 'Gratidão',
    glyph: 'diamond',
    bg: 'oklch(0.95 0.04 95)',
    border: 'oklch(0.86 0.08 95)',
    fg: 'oklch(0.45 0.10 95)',
    dot: 'oklch(0.74 0.14 95)'
  },
  {
    type: 'FASTING',
    emoji: '🕊️',
    label: 'Jejum',
    glyph: 'beads',
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
    bg: 'oklch(0.94 0.03 340)',
    border: 'oklch(0.85 0.05 340)',
    fg: 'oklch(0.42 0.09 340)',
    dot: 'oklch(0.68 0.10 340)'
  }
]

export function prayerActionsFor(tradition: Tradition | undefined | null): PrayerAction[] {
  return tradition === 'EVANGELICAL' ? evangelicalActions : catholicActions
}

export const traditionLabel: Record<Tradition, string> = {
  CATHOLIC: 'Católico(a)',
  EVANGELICAL: 'Evangélico(a)'
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
    description: 'Ave Maria, Pai Nosso, Terço e Rosário no feed',
    emoji: '📿'
  },
  {
    value: 'EVANGELICAL',
    label: 'Evangélico(a)',
    description: 'Orei, Intercessão, Jejum, Gratidão e Clamor no feed',
    emoji: '🕊️'
  }
]
