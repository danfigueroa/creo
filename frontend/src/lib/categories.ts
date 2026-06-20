import i18n from '@/lib/i18n'

export type PrayerCategory = 'HEALTH' | 'FAMILY' | 'WORK' | 'GRIEF' | 'THANKSGIVING' | 'OTHER'

export type PrayerCategoryOption = {
  value: PrayerCategory
  emoji: string
  label: string
  hint: string
}

const CATEGORY_EMOJI: Record<PrayerCategory, string> = {
  HEALTH: '🩺',
  FAMILY: '👨‍👩‍👧',
  WORK: '💼',
  GRIEF: '🕯️',
  THANKSGIVING: '🙏',
  OTHER: '✨'
}

const CATEGORY_ORDER: PrayerCategory[] = ['HEALTH', 'FAMILY', 'WORK', 'GRIEF', 'THANKSGIVING', 'OTHER']

// Built fresh per render so labels reflect the active language. Consumers that
// subscribe to i18n (via useTranslation) re-render on language change.
export function prayerCategoryOptions(): PrayerCategoryOption[] {
  return CATEGORY_ORDER.map((value) => ({
    value,
    emoji: CATEGORY_EMOJI[value],
    label: i18n.t(`categories.${value}.label`),
    hint: i18n.t(`categories.${value}.hint`)
  }))
}

export function categoryLabel(value: string): string {
  if ((value as PrayerCategory) in CATEGORY_EMOJI) {
    return i18n.t(`categories.${value}.label`)
  }
  return value
}

export function categoryEmoji(value: string): string {
  return CATEGORY_EMOJI[value as PrayerCategory] ?? '✨'
}
