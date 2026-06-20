import type { GlyphKind } from '@/components/glyph'
import i18n from '@/lib/i18n'

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
    emoji: '🤲',
    label: 'Intercedi',
    glyph: 'sun',
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
  },
  {
    type: 'PURPOSE',
    emoji: '🤝',
    label: 'Propósito',
    glyph: 'flame',
    bg: 'oklch(0.94 0.03 285)',
    border: 'oklch(0.85 0.05 285)',
    fg: 'oklch(0.42 0.09 285)',
    dot: 'oklch(0.66 0.12 285)'
  }
]

// Labels resolved via i18n so prayer-action names follow the active language.
export function prayerActionsFor(tradition: Tradition | undefined | null): PrayerAction[] {
  const actions = tradition === 'EVANGELICAL' ? evangelicalActions : catholicActions
  return actions.map((action) => ({ ...action, label: i18n.t(`prayerActions.${action.type}`) }))
}

export function traditionLabel(value: Tradition): string {
  return i18n.t(`traditions.${value}.label`)
}

export type TraditionOption = {
  value: Tradition
  label: string
  description: string
  emoji: string
}

export function traditionOptions(): TraditionOption[] {
  return [
    {
      value: 'CATHOLIC',
      label: i18n.t('traditions.CATHOLIC.label'),
      description: i18n.t('traditions.CATHOLIC.description'),
      emoji: '📿'
    },
    {
      value: 'EVANGELICAL',
      label: i18n.t('traditions.EVANGELICAL.label'),
      description: i18n.t('traditions.EVANGELICAL.description'),
      emoji: '🕊️'
    }
  ]
}
