import i18n from '@/lib/i18n'

// Maps a raw Supabase auth error message to a localized, friendly string.
// Consolidado a partir da cópia divergente que vivia em auth-page.tsx — as duas
// telas de acesso traduziam o mesmo erro do Supabase de formas diferentes.
export function translateAuthError(raw: string): string {
  const m = (raw || '').toLowerCase()
  if (m.includes('email not confirmed')) return i18n.t('authPage.errEmailNotConfirmed')
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return i18n.t('authErrors.invalidCredentials')
  }
  if (m.includes('user already registered') || m.includes('already registered')) {
    return i18n.t('authPage.errAlreadyRegistered')
  }
  if (m.includes('password should be at least')) return i18n.t('authErrors.passwordTooShort')
  if (m.includes('rate limit') || m.includes('too many')) return i18n.t('authPage.errRateLimit')
  // Resposta do Supabase quando o magic link roda com shouldCreateUser: false e
  // não existe conta para aquele e-mail.
  if (m.includes('otp') && m.includes('not allowed')) return i18n.t('authErrors.otpNoAccount')
  if (m.includes('signup') && m.includes('disabled')) return i18n.t('authPage.errSignupDisabled')
  if (m.includes('otp') && (m.includes('expired') || m.includes('invalid'))) {
    return i18n.t('authPage.errOtpExpired')
  }
  return raw || i18n.t('authErrors.generic')
}

// Erros que chegam de volta pela URL depois de um link de e-mail.
export function translateCallbackError(code: string, description: string): string {
  const desc = (description || '').toLowerCase()
  const c = (code || '').toLowerCase()
  if (desc.includes('expired') || c.includes('expired')) return i18n.t('authPage.errCallbackExpired')
  if (desc.includes('already') || desc.includes('used') || c === 'access_denied') {
    return i18n.t('authPage.errCallbackUsed')
  }
  if (description) return decodeURIComponent(description.replace(/\+/g, ' '))
  return i18n.t('authPage.errCallbackInvalid')
}
