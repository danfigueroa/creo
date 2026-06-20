import i18n from '@/lib/i18n'

// Maps a raw Supabase auth error message to a localized, friendly string.
export function translateAuthError(raw: string): string {
  const m = (raw || '').toLowerCase()
  if (m.includes('email not confirmed')) return i18n.t('authErrors.emailNotConfirmed')
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) return i18n.t('authErrors.invalidCredentials')
  if (m.includes('user already registered') || m.includes('already registered')) return i18n.t('authErrors.alreadyRegistered')
  if (m.includes('password should be at least')) return i18n.t('authErrors.passwordTooShort')
  if (m.includes('rate limit') || m.includes('too many')) return i18n.t('authErrors.rateLimit')
  return raw || i18n.t('authErrors.generic')
}
