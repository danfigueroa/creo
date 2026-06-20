import { LANGUAGES } from '@/lib/i18n'
import { useLanguage } from '@/lib/use-language'

// Compact pill switcher for unauthenticated screens (landing / auth).
export function LanguageSwitcher({ className }: { className?: string }) {
  const { current, change } = useLanguage()

  return (
    <div
      className={className}
      role="group"
      style={{
        display: 'inline-flex',
        gap: 4,
        padding: 4,
        borderRadius: 'var(--r-pill)',
        border: '1px solid var(--line-2)',
        background: 'var(--card)'
      }}
    >
      {LANGUAGES.map((lang) => {
        const active = current === lang.code
        return (
          <button
            key={lang.code}
            type="button"
            onClick={() => change(lang.code)}
            aria-pressed={active}
            title={lang.nativeLabel}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 10px',
              borderRadius: 'var(--r-pill)',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
              fontFamily: 'var(--sans)',
              background: active ? 'var(--ink)' : 'transparent',
              color: active ? 'var(--bg)' : 'var(--ink-2)'
            }}
          >
            <span aria-hidden>{lang.flag}</span>
            <span>{lang.code === 'pt-BR' ? 'PT' : lang.code.toUpperCase()}</span>
          </button>
        )
      })}
    </div>
  )
}
