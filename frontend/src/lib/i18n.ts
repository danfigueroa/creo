import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import ptBR from '@/locales/pt-BR.json'
import en from '@/locales/en.json'
import es from '@/locales/es.json'

export type LanguageCode = 'pt-BR' | 'en' | 'es'
export type BackendLanguage = 'PT_BR' | 'EN' | 'ES'

export const LANGUAGE_STORAGE_KEY = 'creo-lang'

export const LANGUAGES: Array<{ code: LanguageCode; label: string; nativeLabel: string; flag: string }> = [
  { code: 'pt-BR', label: 'Português', nativeLabel: 'Português (Brasil)', flag: '🇧🇷' },
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Español', nativeLabel: 'Español', flag: '🇪🇸' }
]

const BACKEND_TO_CODE: Record<BackendLanguage, LanguageCode> = {
  PT_BR: 'pt-BR',
  EN: 'en',
  ES: 'es'
}

const CODE_TO_BACKEND: Record<LanguageCode, BackendLanguage> = {
  'pt-BR': 'PT_BR',
  en: 'EN',
  es: 'ES'
}

export function toBackendLanguage(code: string): BackendLanguage {
  return CODE_TO_BACKEND[normalizeLanguage(code)]
}

export function fromBackendLanguage(language: string | null | undefined): LanguageCode {
  if (language && language in BACKEND_TO_CODE) {
    return BACKEND_TO_CODE[language as BackendLanguage]
  }
  return 'pt-BR'
}

// Maps any browser/stored locale onto one of the three supported codes.
export function normalizeLanguage(input: string | null | undefined): LanguageCode {
  if (!input) {
    return 'pt-BR'
  }
  const lower = input.toLowerCase()
  if (lower.startsWith('pt')) {
    return 'pt-BR'
  }
  if (lower.startsWith('es')) {
    return 'es'
  }
  if (lower.startsWith('en')) {
    return 'en'
  }
  return 'pt-BR'
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      en: { translation: en },
      es: { translation: es }
    },
    fallbackLng: 'pt-BR',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
      // Always coerce whatever was detected (e.g. "pt", "en-US") into one of
      // our three supported bundle codes so lookups resolve.
      convertDetectedLanguage: (lng) => normalizeLanguage(lng)
    }
  })

export default i18n
