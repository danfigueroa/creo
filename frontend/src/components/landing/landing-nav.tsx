import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMotionValueEvent, useScroll } from 'motion/react'
import { LanguageSwitcher } from '@/components/language-switcher'
import type { AuthTab } from '@/components/landing/auth-card'
import { scrollToSection } from '@/components/landing/scroll-to'

export const LANDING_SECTIONS = [
  { id: 'como-funciona', key: 'landing.navHow' },
  { id: 'experimente', key: 'landing.navTry' },
  { id: 'recursos', key: 'landing.navFeatures' },
  { id: 'duvidas', key: 'landing.navFaq' }
] as const

// Nav fixa da landing: transparente sobre o hero, ganha fundo e borda assim
// que a página rola.
export function LandingNav({ onAuth }: { onAuth: (tab: AuthTab) => void }) {
  const { t } = useTranslation()
  const { scrollY } = useScroll()
  const [scrolled, setScrolled] = useState(false)
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 8))

  return (
    <header className={`lp-nav ${scrolled ? 'is-scrolled' : ''}`}>
      <div className="lp-nav__inner">
        <a
          href="#top"
          className="lp-brand"
          onClick={(e) => {
            e.preventDefault()
            scrollToSection('top')
          }}
        >
          <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
          <span className="brand-word">Creo</span>
        </a>

        <nav className="lp-nav__links" aria-label={t('landing.navAria')}>
          {LANDING_SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault()
                scrollToSection(s.id)
              }}
            >
              {t(s.key)}
            </a>
          ))}
        </nav>

        <div className="lp-nav__actions">
          {/* Wrapper porque o LanguageSwitcher tem display inline e o CSS precisa
              escondê-lo no mobile (o rodapé tem outro). */}
          <span className="lp-nav__lang">
            <LanguageSwitcher />
          </span>
          <button type="button" className="btn btn--ghost lp-nav__signin" onClick={() => onAuth('entrar')}>
            {t('landing.signIn')}
          </button>
          <button type="button" className="btn btn--primary" onClick={() => onAuth('criar')}>
            {t('landing.signUp')}
          </button>
        </div>
      </div>
    </header>
  )
}
