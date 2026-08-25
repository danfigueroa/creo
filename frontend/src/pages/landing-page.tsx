import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { translateAuthError } from '@/lib/auth-errors'
import { LanguageSwitcher } from '@/components/language-switcher'
import { Glyph } from '@/components/glyph'
import { api } from '@/lib/api'
import { prayerActionsFor, traditionOptions, type Tradition } from '@/lib/traditions'

type AuthTab = 'entrar' | 'criar'
type UsernameState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const USERNAME_RE = /^[a-z0-9_]{3,30}$/
const PASSWORD_MIN = 8

// Checagem de disponibilidade do @username com debounce. É só um aviso: o
// servidor revalida na hora de aplicar, então uma falha aqui não trava nada.
function useUsernameAvailability(username: string): UsernameState {
  const [state, setState] = useState<UsernameState>('idle')

  useEffect(() => {
    if (username === '') {
      setState('idle')
      return
    }
    if (!USERNAME_RE.test(username)) {
      setState('invalid')
      return
    }
    setState('checking')
    let active = true
    const timer = window.setTimeout(async () => {
      try {
        const res = await api.get<{ available: boolean }>('/username-availability', {
          params: { username }
        })
        if (active) setState(res.data.available ? 'available' : 'taken')
      } catch {
        if (active) setState('idle')
      }
    }, 400)

    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [username])

  return state
}

export function LandingPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const FEATURES = [
    { n: '01', title: t('landing.feature1Title'), desc: t('landing.feature1Desc') },
    { n: '02', title: t('landing.feature2Title'), desc: t('landing.feature2Desc') },
    { n: '03', title: t('landing.feature3Title'), desc: t('landing.feature3Desc') }
  ]
  const [tab, setTab] = useState<AuthTab>('entrar')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  // Sem pré-seleção de propósito: com CATHOLIC marcado por padrão, quem passava
  // batido pelo campo saía católico sem nunca ter escolhido.
  const [tradition, setTradition] = useState<Tradition | null>(null)
  const [magic, setMagic] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  const usernameState = useUsernameAvailability(username)
  const howRef = useRef<HTMLElement | null>(null)
  const authRef = useRef<HTMLElement | null>(null)

  // O CTA do rodapé fica muito abaixo do card: trocar a aba sem subir a página
  // não teria efeito visível nenhum.
  function startSignUp() {
    setTab('criar')
    authRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const tabsRef = useRef<HTMLDivElement | null>(null)
  const [ink, setInk] = useState({ x: 0, w: 0 })
  useEffect(() => {
    const el = tabsRef.current?.querySelector(`[data-tab="${tab}"]`) as HTMLElement | null
    if (!el || !tabsRef.current) return
    const tr = tabsRef.current.getBoundingClientRect()
    const er = el.getBoundingClientRect()
    setInk({ x: er.left - tr.left, w: er.width })
  }, [tab])

  async function onSignIn(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    const supabase = getSupabaseClient()
    if (!supabase) {
      setError(t('authErrors.supabaseMissing'))
      return
    }
    setIsLoading(true)
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({ email, password: pass })
      if (signErr) {
        setError(translateAuthError(signErr.message))
        return
      }
      const token = (data.session as any)?.access_token as string | undefined
      if (!token) {
        setError(t('authErrors.cannotStartSession'))
        return
      }
      setAccessToken(token)
      navigate('/feed', { replace: true })
    } finally {
      setIsLoading(false)
    }
  }

  async function onSignUp(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    const supabase = getSupabaseClient()
    if (!supabase) {
      setError(t('authErrors.supabaseMissing'))
      return
    }
    if (!name.trim()) {
      setError(t('landing.namePrompt'))
      return
    }
    if (!USERNAME_RE.test(username)) {
      setError(t('landing.usernameInvalid'))
      return
    }
    if (usernameState === 'taken') {
      setError(t('landing.usernameTaken'))
      return
    }
    if (pass.length < PASSWORD_MIN) {
      setError(t('landing.passwordMin', { min: PASSWORD_MIN }))
      return
    }
    if (!tradition) {
      setError(t('landing.traditionPrompt'))
      return
    }
    setIsLoading(true)
    try {
      const { error: signErr } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          // O backend aplica esta metadata na primeira requisição autenticada
          // (migration 000018), então a escolha vale em qualquer dispositivo.
          data: { display_name: name.trim(), username, tradition }
        }
      })
      if (signErr) {
        setError(translateAuthError(signErr.message))
        return
      }
      setResendState('idle')
      setPendingEmail(email.trim())
    } finally {
      setIsLoading(false)
    }
  }

  async function onResend() {
    if (!pendingEmail) return
    const supabase = getSupabaseClient()
    if (!supabase) return
    setError('')
    setResendState('sending')
    try {
      const { error: resendErr } = await supabase.auth.resend({ type: 'signup', email: pendingEmail })
      if (resendErr) {
        setError(translateAuthError(resendErr.message))
        setResendState('idle')
        return
      }
      setResendState('sent')
    } catch {
      setResendState('idle')
    }
  }

  async function onMagicLink() {
    setError('')
    setInfo('')
    if (!email) {
      setError(t('landing.magicEmailPrompt'))
      return
    }
    const supabase = getSupabaseClient()
    if (!supabase) {
      setError(t('authErrors.supabaseMissing'))
      return
    }
    setIsLoading(true)
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth` }
      })
      if (otpErr) {
        setError(translateAuthError(otpErr.message))
        return
      }
      setMagic(true)
      setInfo(t('landing.magicSent', { email: email.trim() }))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app app--welcome" data-screen-label="Welcome">
      <div className="welcome">
        <section className="welcome__hero" aria-label={t('landing.heroAria')}>
          <div className="welcome__brand">
            <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
            <span className="brand-word">Creo</span>
            <LanguageSwitcher className="welcome__lang" />
          </div>

          <h1 className="welcome__title">
            <span dangerouslySetInnerHTML={{ __html: t('landing.title') }} />
          </h1>

          <p className="welcome__lede">
            {t('landing.lede')}
          </p>

          <ul className="welcome__features">
            {FEATURES.map((f) => (
              <li key={f.n} className="welcome__feature">
                <span className="welcome__feature-n">{f.n}</span>
                <div className="welcome__feature-text">
                  <h3>{f.title}</h3>
                  <p>{f.desc}</p>
                </div>
              </li>
            ))}
          </ul>

          <button
            type="button"
            className="welcome__more"
            onClick={() => howRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          >
            {t('landing.seeHow')}
            <span aria-hidden>↓</span>
          </button>

          <figure className="welcome__quote">
            <blockquote>
              {t('landing.quote')}
            </blockquote>
            <figcaption>{t('landing.quoteRef')}</figcaption>
          </figure>
        </section>

        <section className="welcome__auth" aria-label={t('landing.authAria')} ref={authRef}>
          <div className="welcome__auth-card">
            <div className="welcome__tabs" ref={tabsRef} role="tablist">
              <button
                type="button"
                data-tab="entrar"
                className={`welcome__tab ${tab === 'entrar' ? 'is-on' : ''}`}
                onClick={() => setTab('entrar')}
                role="tab"
                aria-selected={tab === 'entrar'}
              >
                {t('landing.signIn')}
              </button>
              <button
                type="button"
                data-tab="criar"
                className={`welcome__tab ${tab === 'criar' ? 'is-on' : ''}`}
                onClick={() => setTab('criar')}
                role="tab"
                aria-selected={tab === 'criar'}
              >
                {t('landing.signUp')}
              </button>
              <span
                className="welcome__tab-ink"
                style={{ transform: `translateX(${ink.x}px)`, width: ink.w }}
              />
            </div>

            {tab === 'entrar' ? (
              <>
                <h2 className="welcome__auth-title">{t('landing.signInTitle')}</h2>
                <p className="welcome__auth-sub">
                  {t('landing.signInSub')}
                </p>

                <form className="welcome__form" onSubmit={onSignIn}>
                  <label className="welcome__field">
                    <span className="welcome__label">{t('landing.email')}</span>
                    <input
                      type="email"
                      placeholder={t('landing.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>

                  <label className="welcome__field">
                    <div className="welcome__label-row">
                      <span className="welcome__label">{t('landing.password')}</span>
                      <Link className="welcome__link-quiet" to="/auth?reset=1">
                        {t('landing.forgotPassword')}
                      </Link>
                    </div>
                    <input
                      type="password"
                      placeholder="••••••••"
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      required
                    />
                  </label>

                  <button type="submit" disabled={isLoading} className="btn btn--primary welcome__cta">
                    {isLoading ? t('landing.signingIn') : t('landing.signIn')}
                  </button>

                  <div className="welcome__or">
                    <span>{t('landing.or')}</span>
                  </div>

                  <button
                    type="button"
                    onClick={onMagicLink}
                    disabled={isLoading}
                    className={`welcome__magic ${magic ? 'is-sent' : ''}`}
                  >
                    <span className="welcome__magic-icon" aria-hidden>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M2 4.5l5 3 5-3M2 4.5v5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-5M2 4.5l4.4-2.2a1 1 0 0 1 1.2 0L12 4.5"
                          stroke="currentColor"
                          strokeWidth="1.2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    {magic ? t('landing.magicSentShort') : t('landing.magicCta')}
                  </button>
                </form>

                {error && (
                  <p role="alert" style={alertStyle()}>
                    {error}
                  </p>
                )}
                {info && (
                  <p role="status" style={alertStyle()}>
                    {info}
                  </p>
                )}

                <p className="welcome__foot">
                  {t('landing.noAccount')}{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setTab('criar')
                    }}
                  >
                    {t('landing.createOne')}
                  </a>
                </p>
              </>
            ) : pendingEmail ? (
              <>
                <h2 className="welcome__auth-title">{t('landing.checkInboxTitle')}</h2>
                <p className="welcome__auth-sub">{t('landing.checkInboxText', { email: pendingEmail })}</p>

                <div className="welcome__form">
                  <button
                    type="button"
                    className="welcome__magic"
                    disabled={resendState !== 'idle'}
                    onClick={onResend}
                  >
                    {resendState === 'sending'
                      ? t('landing.resending')
                      : resendState === 'sent'
                        ? t('landing.resent')
                        : t('landing.resend')}
                  </button>
                </div>

                {error && (
                  <p role="alert" style={alertStyle()}>
                    {error}
                  </p>
                )}

                <p className="welcome__foot">
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setPendingEmail(null)
                      setResendState('idle')
                      setError('')
                    }}
                  >
                    {t('landing.useAnotherEmail')}
                  </a>
                </p>
              </>
            ) : (
              <>
                <h2 className="welcome__auth-title">{t('landing.signUpTitle')}</h2>
                <p className="welcome__auth-sub">
                  {t('landing.signUpSub')}
                </p>

                <form className="welcome__form" onSubmit={onSignUp}>
                  <label className="welcome__field">
                    <span className="welcome__label">{t('landing.name')}</span>
                    <input
                      type="text"
                      placeholder={t('landing.namePlaceholder')}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </label>

                  <label className="welcome__field">
                    <div className="welcome__label-row">
                      <span className="welcome__label">{t('landing.username')}</span>
                      <span className="welcome__link-quiet" style={{ cursor: 'default' }}>
                        {usernameState === 'checking' && t('landing.usernameChecking')}
                        {usernameState === 'available' && t('landing.usernameAvailable')}
                        {usernameState === 'taken' && t('landing.usernameTaken')}
                        {usernameState === 'invalid' && t('landing.usernameInvalid')}
                      </span>
                    </div>
                    <input
                      type="text"
                      placeholder={t('landing.usernamePlaceholder')}
                      value={username}
                      onChange={(e) => setUsername(e.target.value.replace(/^@+/, '').replace(/\s/g, '').toLowerCase())}
                      required
                    />
                    <span className="welcome__hint">{t('landing.usernameHelp')}</span>
                  </label>

                  <label className="welcome__field">
                    <span className="welcome__label">{t('landing.email')}</span>
                    <input
                      type="email"
                      placeholder={t('landing.emailPlaceholder')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>

                  <label className="welcome__field">
                    <span className="welcome__label">{t('landing.password')}</span>
                    <input
                      type="password"
                      placeholder={t('landing.passwordPlaceholder')}
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      required
                    />
                  </label>

                  <div className="welcome__field">
                    <span className="welcome__label">{t('landing.tradition')}</span>
                    <div className="optgrid" style={{ marginTop: 4 }}>
                      {traditionOptions().map((option) => {
                        const active = tradition === option.value
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setTradition(option.value)}
                            aria-pressed={active}
                            className={`opt ${active ? 'is-on' : ''}`}
                          >
                            <span className="opt__mark" aria-hidden>{option.emoji}</span>
                            <span className="min-w-0">
                              <span className="opt__label">{option.label}</span>
                              <span className="opt__desc">{option.description}</span>
                            </span>
                            {active && <span className="opt__check" aria-hidden>✓</span>}
                          </button>
                        )
                      })}
                    </div>
                    <span className="welcome__hint">{t('landing.traditionHelp')}</span>
                  </div>

                  <button type="submit" disabled={isLoading} className="btn btn--primary welcome__cta">
                    {isLoading ? t('landing.creating') : t('landing.signUp')}
                  </button>

                  <p className="welcome__terms">
                    {t('landing.terms')}
                  </p>
                </form>

                {error && (
                  <p role="alert" style={alertStyle()}>
                    {error}
                  </p>
                )}
                {info && (
                  <p role="status" style={alertStyle()}>
                    {info}
                  </p>
                )}

                <p className="welcome__foot">
                  {t('landing.haveAccount')}{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setTab('entrar')
                    }}
                  >
                    {t('landing.signInDot')}
                  </a>
                </p>
              </>
            )}
          </div>

          <div className="welcome__assure">
            <span className="welcome__assure-dot" aria-hidden />
            {t('landing.assure')}
          </div>
        </section>
      </div>

      <LandingSections howRef={howRef} onStart={startSignUp} />
    </div>
  )
}

function LandingSections({
  howRef,
  onStart
}: {
  howRef: React.MutableRefObject<HTMLElement | null>
  onStart: () => void
}) {
  const { t } = useTranslation()

  const steps = [
    { n: '01', title: t('landing.step1Title'), text: t('landing.step1Text') },
    { n: '02', title: t('landing.step2Title'), text: t('landing.step2Text') },
    { n: '03', title: t('landing.step3Title'), text: t('landing.step3Text') }
  ]

  const cards = [
    { mark: '🕯️', title: t('landing.do1Title'), text: t('landing.do1Text') },
    { mark: '📿', title: t('landing.do2Title'), text: t('landing.do2Text') },
    { mark: '⛪', title: t('landing.do3Title'), text: t('landing.do3Text') },
    { mark: '🤝', title: t('landing.do4Title'), text: t('landing.do4Text') },
    { mark: '📣', title: t('landing.do5Title'), text: t('landing.do5Text') },
    { mark: '🔔', title: t('landing.do6Title'), text: t('landing.do6Text') }
  ]

  const visibilities = ['PUBLIC', 'GROUP_ONLY', 'PRIVATE'] as const

  return (
    <div className="lp">
      <section className="lp-section" ref={howRef}>
        <p className="lp-section__eyebrow">{t('landing.howEyebrow')}</p>
        <h2 className="lp-section__title">{t('landing.howTitle')}</h2>
        <p className="lp-section__sub">{t('landing.howSub')}</p>

        <div className="lp-section__body lp-steps">
          {steps.map((step) => (
            <article key={step.n} className="lp-step">
              <span className="lp-step__n">{step.n}</span>
              <h3 className="lp-step__title">{step.title}</h3>
              <p className="lp-step__text">{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <p className="lp-section__eyebrow">{t('landing.doEyebrow')}</p>
        <h2 className="lp-section__title">{t('landing.doTitle')}</h2>
        <p className="lp-section__sub">{t('landing.doSub')}</p>

        <div className="lp-section__body lp-grid">
          {cards.map((card) => (
            <article key={card.title} className="lp-card">
              <span className="lp-card__mark" aria-hidden>{card.mark}</span>
              <h3 className="lp-card__title">{card.title}</h3>
              <p className="lp-card__text">{card.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <p className="lp-section__eyebrow">{t('landing.tradsEyebrow')}</p>
        <h2 className="lp-section__title">{t('landing.tradsTitle')}</h2>
        <p className="lp-section__sub">{t('landing.tradsSub')}</p>

        <div className="lp-section__body lp-trads">
          {traditionOptions().map((option) => (
            <article key={option.value} className="lp-trad">
              <div className="lp-trad__head">
                <span className="lp-trad__mark" aria-hidden>{option.emoji}</span>
                <h3 className="lp-trad__title">{option.label}</h3>
              </div>
              <p className="lp-trad__text">{t(`landing.trad${option.value === 'CATHOLIC' ? 'Catholic' : 'Evangelical'}Text`)}</p>
              <div className="lp-trad__actions">
                {/* As mesmas ações que o feed oferece — vêm de lib/traditions.ts,
                    então esta vitrine não desatualiza sozinha. */}
                {prayerActionsFor(option.value).map((action) => (
                  <span
                    key={action.type}
                    className="lp-rx"
                    style={{
                      ['--rx-bg' as any]: action.bg,
                      ['--rx-border' as any]: action.border,
                      ['--rx-fg' as any]: action.fg
                    }}
                  >
                    <Glyph kind={action.glyph} size={12} color={action.dot} />
                    {action.label}
                  </span>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <p className="lp-section__eyebrow">{t('landing.privacyEyebrow')}</p>
        <h2 className="lp-section__title">{t('landing.privacyTitle')}</h2>
        <p className="lp-section__sub">{t('landing.privacySub')}</p>

        <div className="lp-section__body lp-privacy">
          {visibilities.map((level) => (
            <article key={level} className="lp-card">
              <h3 className="lp-card__title">{t(`visibility.${level}.label`)}</h3>
              <p className="lp-card__text">{t(`visibility.${level}.description`)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="lp-section">
        <p className="lp-section__eyebrow">{t('landing.langsEyebrow')}</p>
        <h2 className="lp-section__title">{t('landing.langsTitle')}</h2>
        <p className="lp-section__sub">{t('landing.langsSub')}</p>

        <div className="lp-section__body lp-langs">
          <LanguageSwitcher />
          <button type="button" className="btn btn--primary" onClick={onStart}>
            {t('landing.signUp')}
          </button>
        </div>
      </section>

      <footer className="lp-foot">
        <span className="lp-foot__brand">
          <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
          <span className="brand-word">Creo</span>
        </span>
        <p className="lp-foot__note">{t('landing.terms')}</p>
      </footer>
    </div>
  )
}

function alertStyle(): React.CSSProperties {
  return {
    marginTop: 12,
    fontSize: 13,
    color: 'var(--ink-2)',
    background: 'var(--card-2)',
    border: '1px solid var(--line-2)',
    borderRadius: 'var(--r-2)',
    padding: '8px 12px'
  }
}
