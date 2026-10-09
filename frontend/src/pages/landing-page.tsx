import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { m, useScroll, useTransform, type Variants } from 'motion/react'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Glyph, type GlyphKind } from '@/components/glyph'
import type { AuthTab } from '@/components/landing/auth-card'
import { AuthDialog } from '@/components/landing/auth-dialog'
import { FeatureBento } from '@/components/landing/feature-bento'
import { Faq } from '@/components/landing/faq'
import { FinalCta } from '@/components/landing/final-cta'
import { HeroDemo } from '@/components/landing/hero-demo'
import { HowItWorks } from '@/components/landing/how-it-works'
import { LandingNav } from '@/components/landing/landing-nav'
import { Playground, PrivacyDemo } from '@/components/landing/playground'
import { scrollToSection } from '@/components/landing/scroll-to'
import { fadeUp, revealUp } from '@/lib/motion'
import type { Tradition } from '@/lib/traditions'

// Hero: os blocos entram em cascata no mount. Filhos usam `fadeUp`, e o
// staggerChildren daqui define o ritmo.
const heroStagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } }
}

const PILLARS: { n: number; glyph: GlyphKind }[] = [
  { n: 1, glyph: 'rose' },
  { n: 2, glyph: 'beads' },
  { n: 3, glyph: 'ring' }
]

function readAuthParam(value: string | null): AuthTab | null {
  return value === 'entrar' || value === 'criar' ? value : null
}

export function LandingPage() {
  const { t } = useTranslation()
  const [params, setParams] = useSearchParams()
  // `/?auth=entrar|criar` abre o painel direto — serve para links de fora.
  const [authTab, setAuthTab] = useState<AuthTab | null>(() => readAuthParam(params.get('auth')))
  // Tradição da demo. `picked` só vira true quando o visitante clica: só então
  // ela pré-seleciona o cadastro, para ninguém sair católico sem ter escolhido.
  const [tradition, setTradition] = useState<Tradition>('CATHOLIC')
  const [picked, setPicked] = useState(false)

  const closeAuth = useCallback(() => {
    setAuthTab(null)
    if (params.has('auth')) {
      const next = new URLSearchParams(params)
      next.delete('auth')
      setParams(next, { replace: true })
    }
  }, [params, setParams])

  const startSignUp = useCallback(() => setAuthTab('criar'), [])

  // Parallax leve do mockup ao rolar o hero.
  const { scrollY } = useScroll()
  const demoY = useTransform(scrollY, [0, 700], [0, -60])

  return (
    <div className="lp" id="top">
      <LandingNav onAuth={setAuthTab} />

      <main>
        <section className="lp-hero" aria-label={t('landing.heroAria')}>
          <span className="lp-hero__glow lp-hero__glow--a" aria-hidden />
          <span className="lp-hero__glow lp-hero__glow--b" aria-hidden />

          <m.div className="lp-hero__copy" variants={heroStagger} initial="hidden" animate="show">
            <m.p className="lp-pill" variants={fadeUp}>
              <span className="lp-pill__dot" aria-hidden />
              {t('landing.heroEyebrow')}
            </m.p>
            <m.h1 className="lp-hero__title" variants={fadeUp} dangerouslySetInnerHTML={{ __html: t('landing.title') }} />
            <m.p className="lp-hero__lede" variants={fadeUp}>
              {t('landing.lede')}
            </m.p>
            <m.div className="lp-hero__actions" variants={fadeUp}>
              <button type="button" className="btn btn--primary lp-btn-lg" onClick={startSignUp}>
                {t('landing.ctaPrimary')}
              </button>
              <button type="button" className="btn btn--ghost-out lp-btn-lg" onClick={() => scrollToSection('como-funciona')}>
                {t('landing.seeHow')} <span aria-hidden>↓</span>
              </button>
            </m.div>
            <m.ul className="lp-trust" variants={fadeUp}>
              {(['trustFree', 'trustPrivate', 'trustTraditions', 'trustLangs'] as const).map((k) => (
                <li key={k}>
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                    <path d="M3 7.2l2.6 2.6L11 4.4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t(`landing.${k}`)}
                </li>
              ))}
            </m.ul>
          </m.div>

          <m.div className="lp-hero__demo" style={{ y: demoY }}>
            <HeroDemo tradition={tradition} />
          </m.div>
        </section>

        <section className="lp-section lp-pillars">
          <m.header className="lp-head lp-head--center" variants={revealUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
            <m.p className="lp-eyebrow" variants={fadeUp}>{t('landing.pillarsEyebrow')}</m.p>
            <m.h2 className="lp-h2" variants={fadeUp}>{t('landing.pillarsTitle')}</m.h2>
            <m.p className="lp-sub" variants={fadeUp}>{t('landing.pillarsSub')}</m.p>
          </m.header>
          <m.div className="lp-pillars__grid" variants={revealUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
            {PILLARS.map((p) => (
              <m.article key={p.n} className="lp-pillar" variants={fadeUp}>
                <span className="lp-pillar__mark" aria-hidden>
                  <Glyph kind={p.glyph} size={20} color="var(--ink-2)" />
                </span>
                <h3 className="lp-pillar__title">{t(`landing.pillar${p.n}Title`)}</h3>
                <p className="lp-pillar__text">{t(`landing.pillar${p.n}Text`)}</p>
              </m.article>
            ))}
          </m.div>
        </section>

        <HowItWorks />

        <Playground
          tradition={tradition}
          onTradition={(next) => {
            setTradition(next)
            setPicked(true)
          }}
          onStart={() => {
            setPicked(true)
            setAuthTab('criar')
          }}
        />

        <PrivacyDemo />

        <FeatureBento />

        <Faq />

        <FinalCta onStart={startSignUp} onSignIn={() => setAuthTab('entrar')} />
      </main>

      <footer className="lp-foot">
        <span className="lp-brand">
          <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
          <span className="brand-word">Creo</span>
        </span>
        <LanguageSwitcher />
        <p className="lp-foot__note">{t('landing.terms')}</p>
      </footer>

      <AuthDialog tab={authTab} tradition={picked ? tradition : null} onClose={closeAuth} />
    </div>
  )
}
