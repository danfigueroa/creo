import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useToast } from '@/components/toaster'
import { useSessionStore } from '@/state/session-store'
import { LANGUAGE_STORAGE_KEY, normalizeLanguage, toBackendLanguage, type LanguageCode } from '@/lib/i18n'

// Centralizes a language change: updates i18next (which persists to localStorage
// via the detector), and — when authenticated — saves the preference to the
// backend so it follows the user across devices.
export function useLanguage() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const accessToken = useSessionStore((s) => s.accessToken)

  const persist = useMutation({
    mutationFn: (code: LanguageCode) =>
      api.patch('/profile/language', { language: toBackendLanguage(code) }),
    onSuccess: () => {
      // A UI inteira troca de idioma de uma vez; sem confirmação a mudança fica
      // ambígua com uma falha de rede que deixasse a preferência só local.
      toast.success(t('profile.languageUpdated'))
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    }
  })

  const current = normalizeLanguage(i18n.language)

  const change = useCallback(
    (code: LanguageCode) => {
      if (code === current) {
        return
      }
      void i18n.changeLanguage(code)
      try {
        localStorage.setItem(LANGUAGE_STORAGE_KEY, code)
      } catch {
        // ignore storage failures (private mode, quota)
      }
      if (accessToken) {
        persist.mutate(code)
      }
    },
    [accessToken, current, i18n, persist]
  )

  return { current, change, isSaving: persist.isPending }
}
