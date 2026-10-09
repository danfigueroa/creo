import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { translateAuthError } from '@/lib/auth-errors'
import { PASSWORD_MIN, isEmailNotConfirmed } from '@/lib/password'
import { useCooldown } from '@/lib/use-cooldown'
import { TurnstileWidget, captchaOption, useCaptcha } from '@/components/turnstile'
import { api } from '@/lib/api'
import { traditionOptions, type Tradition } from '@/lib/traditions'

export type AuthTab = 'entrar' | 'criar'
type UsernameState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid'

const USERNAME_RE = /^[a-z0-9_]{3,30}$/
const RESEND_COOLDOWN_S = 60

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

// O fluxo inteiro de acesso da landing: abas, senha, link mágico, cadastro e
// reenvio da confirmação. Vive no painel aberto pela nav e pelos CTAs.
export function AuthCard({
  initialTab = 'entrar',
  initialTradition = null
}: {
  initialTab?: AuthTab
  initialTradition?: Tradition | null
}) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const [tab, setTab] = useState<AuthTab>(initialTab)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  // Sem pré-seleção de propósito: com CATHOLIC marcado por padrão, quem passava
  // batido pelo campo saía católico sem nunca ter escolhido. A exceção é a
  // tradição que a pessoa clicou no playground da landing — isso é escolha.
  const [tradition, setTradition] = useState<Tradition | null>(initialTradition)
  const [magic, setMagic] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  // Login recusado por e-mail não confirmado: guarda o endereço para oferecer
  // o reenvio ali mesmo, sem mandar a pessoa procurar a opção em outra tela.
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null)
  const captcha = useCaptcha()
  const resendCooldown = useCooldown(RESEND_COOLDOWN_S)

  // Com o captcha ligado, a chamada sem token seria recusada pelo Supabase;
  // melhor avisar aqui do que mostrar o erro cru de verificação.
  function captchaReady(): boolean {
    if (captcha.enabled && !captcha.token) {
      setError(t('security.captchaPending'))
      return false
    }
    return true
  }

  const usernameState = useUsernameAvailability(username)

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
    if (!captchaReady()) return
    setUnconfirmedEmail(null)
    setIsLoading(true)
    try {
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
        options: captchaOption(captcha.token)
      })
      if (signErr) {
        if (isEmailNotConfirmed(signErr.message)) setUnconfirmedEmail(email.trim())
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
      captcha.reset()
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
    if (!captchaReady()) return
    setIsLoading(true)
    try {
      // E-mail já cadastrado também cai aqui sem erro (o Supabase devolve um
      // usuário falso para não revelar quem tem conta), então a tela seguinte
      // é a mesma nos dois casos de propósito.
      const { error: signErr } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          ...captchaOption(captcha.token),
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
      resendCooldown.start()
    } finally {
      captcha.reset()
      setIsLoading(false)
    }
  }

  async function onResend() {
    const target = pendingEmail || unconfirmedEmail
    if (!target || resendCooldown.active) return
    const supabase = getSupabaseClient()
    if (!supabase) return
    setError('')
    setInfo('')
    if (!captchaReady()) return
    setResendState('sending')
    try {
      const { error: resendErr } = await supabase.auth.resend({
        type: 'signup',
        email: target,
        options: { ...captchaOption(captcha.token), emailRedirectTo: `${window.location.origin}/auth` }
      })
      if (resendErr) {
        setError(translateAuthError(resendErr.message))
        setResendState('idle')
        return
      }
      setResendState('sent')
      resendCooldown.start()
      if (!pendingEmail) setInfo(t('authPage.resendSent', { email: target }))
    } catch {
      setResendState('idle')
    } finally {
      captcha.reset()
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
    if (!captchaReady()) return
    setIsLoading(true)
    try {
      const { error: otpErr } = await supabase.auth.signInWithOtp({
        email,
        // Só acesso: sem isto, um e-mail digitado errado criava uma conta nova
        // com username e tradição padrão.
        options: {
          ...captchaOption(captcha.token),
          emailRedirectTo: `${window.location.origin}/auth`,
          shouldCreateUser: false
        }
      })
      if (otpErr) {
        setError(translateAuthError(otpErr.message))
        return
      }
      setMagic(true)
      setInfo(t('landing.magicSent', { email: email.trim() }))
    } finally {
      captcha.reset()
      setIsLoading(false)
    }
  }

  return (
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

            <TurnstileWidget captcha={captcha} />

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
          {unconfirmedEmail && (
            <button
              type="button"
              className="welcome__link-quiet"
              style={{ marginTop: 10 }}
              disabled={resendState === 'sending' || resendCooldown.active}
              onClick={onResend}
            >
              {resendCooldown.active
                ? t('security.resendIn', { seconds: resendCooldown.left })
                : t('authPage.resendConfirmation')}
            </button>
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
            <TurnstileWidget captcha={captcha} />
            <button
              type="button"
              className="welcome__magic"
              disabled={resendState === 'sending' || resendCooldown.active}
              onClick={onResend}
            >
              {resendState === 'sending'
                ? t('landing.resending')
                : resendCooldown.active
                  ? resendState === 'sent'
                    ? `${t('landing.resent')} · ${t('security.resendIn', { seconds: resendCooldown.left })}`
                    : t('security.resendIn', { seconds: resendCooldown.left })
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
                autoComplete="new-password"
                minLength={PASSWORD_MIN}
                required
              />
              <span className="welcome__hint">{t('landing.passwordMin', { min: PASSWORD_MIN })}</span>
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

            <TurnstileWidget captcha={captcha} />

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
