import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { EmailOtpType } from '@supabase/supabase-js'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { LanguageSwitcher } from '@/components/language-switcher'
import { translateAuthError, translateCallbackError } from '@/lib/auth-errors'
import { isEmailNotConfirmed } from '@/lib/password'
import { useCooldown } from '@/lib/use-cooldown'
import { TurnstileWidget, captchaOption, useCaptcha } from '@/components/turnstile'

// Tipos que os templates de e-mail mandam para cá via ?token_hash=&type=.
// `recovery` vai direto para /auth/reset.
const VERIFY_TYPES: EmailOtpType[] = ['email', 'signup', 'magiclink', 'email_change', 'invite']

function verifyTypeFrom(raw: string | null): EmailOtpType | null {
  return VERIFY_TYPES.find((v) => v === raw) ?? null
}

export function AuthPage() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const [searchParams] = useSearchParams()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // A criação de conta vive só na landing agora; esta tela cuida de acesso,
  // link mágico, redefinição de senha e dos callbacks de e-mail.
  const [showReset, setShowReset] = useState(searchParams.get('reset') === '1')
  const [isLoading, setIsLoading] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null)
  const [linkExpired, setLinkExpired] = useState(false)
  const supabase = getSupabaseClient()
  const captcha = useCaptcha()
  const resendCooldown = useCooldown(60)

  const nextPath = searchParams.get('next') || '/feed'
  const tokenHash = searchParams.get('token_hash')
  const verifyType = verifyTypeFrom(searchParams.get('type'))
  const [verifying, setVerifying] = useState(Boolean(tokenHash && verifyType))

  function captchaReady(): boolean {
    if (captcha.enabled && !captcha.token) {
      setError(t('security.captchaPending'))
      return false
    }
    return true
  }

  useEffect(() => {
    const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
    const hashParams = new URLSearchParams(hash)
    const errorCode = searchParams.get('error') || hashParams.get('error') || ''
    const errorDescription =
      searchParams.get('error_description') || hashParams.get('error_description') || ''
    if (errorCode || errorDescription) {
      setError(translateCallbackError(errorCode, errorDescription))
      setLinkExpired(true)
      if (window.location.hash) {
        window.history.replaceState({}, '', window.location.pathname + window.location.search)
      }
    }
  }, [searchParams])

  useEffect(() => {
    if (!supabase) {
      return
    }
    let active = true

    const redirectIfSession = (token: string | null | undefined) => {
      if (!active || !token) return
      setAccessToken(token)
      navigate(nextPath, { replace: true })
    }

    // Com um link de e-mail pendente, a sessão que já existir não pode
    // redirecionar antes da verificação terminar.
    if (!verifying) {
      supabase.auth.getSession().then(({ data }) => redirectIfSession(data.session?.access_token))
    }
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      redirectIfSession(session?.access_token)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [navigate, nextPath, setAccessToken, supabase, verifying])

  // Links de confirmação de cadastro, link mágico e troca de e-mail chegam com
  // token_hash. Diferente do ?code= do PKCE, funcionam em qualquer navegador,
  // não só no que pediu o e-mail.
  useEffect(() => {
    if (!supabase || !tokenHash || !verifyType) return
    let active = true
    supabase.auth.verifyOtp({ token_hash: tokenHash, type: verifyType }).then(({ data, error: verifyError }) => {
      if (!active) return
      window.history.replaceState({}, '', window.location.pathname)
      if (verifyError) {
        setError(translateCallbackError('', verifyError.message))
        setLinkExpired(verifyType !== 'email_change')
        setVerifying(false)
        return
      }
      if (!data.session) {
        // Troca de e-mail segura: o primeiro dos dois links confirma só metade.
        setInfo(t(verifyType === 'email_change' ? 'security.emailChangeHalf' : 'security.linkConfirmed'))
        setVerifying(false)
        return
      }
      setVerifying(false)
    })
    return () => {
      active = false
    }
  }, [supabase, t, tokenHash, verifyType])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setIsLoading(true)

    try {
      if (!supabase) {
        setError(t('authPage.supabaseMissingEnv'))
        return
      }
      if (!captchaReady()) return
      setPendingConfirmEmail(null)
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
        options: captchaOption(captcha.token)
      })
      if (signInError) {
        if (isEmailNotConfirmed(signInError.message)) setPendingConfirmEmail(email.trim())
        setError(translateAuthError(signInError.message))
        return
      }

      const token = data.session?.access_token
      if (!token) {
        setError(t('authPage.cannotStartSession'))
        return
      }

      setAccessToken(token)
      navigate(nextPath, { replace: true })
    } catch (err: any) {
      const message = err?.message || ''
      if (message.toLowerCase().includes('network')) {
        setError(t('authPage.networkError'))
      } else {
        setError(t('authErrors.generic'))
      }
    } finally {
      captcha.reset()
      setIsLoading(false)
    }
  }

  async function onPasswordlessEmail() {
    setError('')
    setInfo('')
    if (!email) {
      setError(t('authPage.emailForLink'))
      return
    }
    if (!supabase) {
      setError(t('authPage.supabaseMissingFrontend'))
      return
    }

    if (!captchaReady()) return
    setIsLoading(true)
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          ...captchaOption(captcha.token),
          emailRedirectTo: `${window.location.origin}/auth`,
          // Só acesso: sem isto, um e-mail digitado errado criava uma conta nova
          // com username e tradição padrão.
          shouldCreateUser: false
        }
      })
      if (otpError) {
        setError(translateAuthError(otpError.message))
        return
      }
      setInfo(t('authPage.magicSent'))
    } finally {
      captcha.reset()
      setIsLoading(false)
    }
  }

  async function onResetPassword() {
    setError('')
    setInfo('')
    if (!email) {
      setError(t('authPage.emailForReset'))
      return
    }
    if (!supabase) {
      setError(t('authPage.supabaseMissingFrontend'))
      return
    }

    if (!captchaReady()) return
    setIsLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        ...captchaOption(captcha.token),
        redirectTo: `${window.location.origin}/auth/reset`
      })
      if (resetError) {
        setError(translateAuthError(resetError.message))
        return
      }
      setInfo(t('authPage.resetSent'))
      setShowReset(false)
    } finally {
      captcha.reset()
      setIsLoading(false)
    }
  }

  async function onResendConfirmation() {
    setError('')
    if (!supabase) {
      setError(t('authPage.supabaseMissingFrontend'))
      return
    }
    const target = pendingConfirmEmail || email.trim()
    if (!target) {
      setError(t('authPage.emailForResend'))
      return
    }
    if (resendCooldown.active || !captchaReady()) return
    setIsLoading(true)
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: target,
        options: { ...captchaOption(captcha.token), emailRedirectTo: `${window.location.origin}/auth` }
      })
      if (resendError) {
        setError(translateAuthError(resendError.message))
        return
      }
      setInfo(t('authPage.resendSent', { email: target }))
      resendCooldown.start()
    } finally {
      captcha.reset()
      setIsLoading(false)
    }
  }

  return (
    <div className="auth-solo">
      <div className="auth-solo__top">
        <Link to="/" className="welcome__brand" aria-label={t('shell.brandAria')}>
          <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
          <span className="brand-word">Creo</span>
        </Link>
        <LanguageSwitcher />
      </div>

      <section className="welcome__auth-card">
        <h1 className="welcome__auth-title">
          {showReset ? t('authPage.resetTitle') : t('authPage.welcomeBack')}
        </h1>
        <p className="welcome__auth-sub">
          {showReset ? t('authPage.resetSub') : t('authPage.signinSub')}
        </p>

        {showReset ? (
          <div className="welcome__form">
            <label className="welcome__field">
              <span className="welcome__label">{t('landing.email')}</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('landing.emailPlaceholder')} type="email" autoComplete="email" />
            </label>
            <TurnstileWidget captcha={captcha} />
            <button type="button" className="btn btn--primary welcome__cta" disabled={isLoading} onClick={onResetPassword}>
              {isLoading ? t('common.loading') : t('authPage.resetCta')}
            </button>
            <button
              type="button"
              className="welcome__link-quiet"
              style={{ alignSelf: 'center' }}
              onClick={() => { setShowReset(false); setError(''); setInfo('') }}
            >
              {t('authPage.backToSignIn')}
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="welcome__form">
            <label className="welcome__field">
              <span className="welcome__label">{t('landing.email')}</span>
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('landing.emailPlaceholder')} type="email" autoComplete="email" />
            </label>
            <label className="welcome__field">
              <div className="welcome__label-row">
                <span className="welcome__label">{t('landing.password')}</span>
                <button className="welcome__link-quiet" onClick={() => setShowReset(true)} type="button">
                  {t('landing.forgotPassword')}
                </button>
              </div>
              <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" autoComplete="current-password" />
            </label>

            <TurnstileWidget captcha={captcha} />

            <button type="submit" className="btn btn--primary welcome__cta" disabled={isLoading || verifying}>
              {isLoading || verifying ? t('common.loading') : t('landing.signIn')}
            </button>

            <div className="welcome__or">
              <span>{t('landing.or')}</span>
            </div>

            <button type="button" className="welcome__magic" disabled={isLoading} onClick={onPasswordlessEmail}>
              {t('landing.magicCta')}
            </button>
          </form>
        )}

        {error && <p role="alert" className="canvas__alert" style={{ marginTop: 16 }}>{error}</p>}
        {info && <p role="status" className="canvas__status" style={{ marginTop: 16 }}>{info}</p>}

        {(pendingConfirmEmail || linkExpired) && (
          <button
            type="button"
            className="welcome__link-quiet"
            style={{ marginTop: 12 }}
            onClick={onResendConfirmation}
            disabled={isLoading || resendCooldown.active}
          >
            {resendCooldown.active
              ? t('security.resendIn', { seconds: resendCooldown.left })
              : t('authPage.resendConfirmation')}
          </button>
        )}

        <p className="welcome__foot">
          {t('landing.noAccount')}{' '}
          <Link to="/">{t('authPage.createYours')}</Link>
        </p>
      </section>

      <figure className="welcome__quote">
        <blockquote>{t('landing.quote')}</blockquote>
        <figcaption>{t('landing.quoteRef')}</figcaption>
      </figure>
    </div>
  )
}
