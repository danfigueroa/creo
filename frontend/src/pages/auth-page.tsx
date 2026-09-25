import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { LanguageSwitcher } from '@/components/language-switcher'
import { translateAuthError, translateCallbackError } from '@/lib/auth-errors'

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

  const nextPath = searchParams.get('next') || '/feed'

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

    supabase.auth.getSession().then(({ data }) => redirectIfSession(data.session?.access_token))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      redirectIfSession(session?.access_token)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [navigate, nextPath, setAccessToken, supabase])

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
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (signInError) {
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

    setIsLoading(true)
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email,
        options: {
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

    setIsLoading(true)
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset`
      })
      if (resetError) {
        setError(translateAuthError(resetError.message))
        return
      }
      setInfo(t('authPage.resetSent'))
      setShowReset(false)
    } finally {
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
    setIsLoading(true)
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: target,
        options: { emailRedirectTo: `${window.location.origin}/auth` }
      })
      if (resendError) {
        setError(translateAuthError(resendError.message))
        return
      }
      setInfo(t('authPage.resendSent', { email: target }))
    } finally {
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

            <button type="submit" className="btn btn--primary welcome__cta" disabled={isLoading}>
              {isLoading ? t('common.loading') : t('landing.signIn')}
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
            disabled={isLoading}
          >
            {t('authPage.resendConfirmation')}
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
