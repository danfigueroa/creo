import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
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
          emailRedirectTo: `${window.location.origin}/auth`
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

  const heroFeatures = [
    { title: t('authPage.hero1Title'), body: t('authPage.hero1Body') },
    { title: t('authPage.hero2Title'), body: t('authPage.hero2Body') },
    { title: t('authPage.hero3Title'), body: t('authPage.hero3Body') }
  ]

  return (
    <div className="mx-auto grid min-h-screen w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-stretch">
      <section className="pv-panel relative flex h-full flex-col overflow-hidden rounded-3xl p-8 sm:p-10">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/15 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-primary/10 blur-3xl"
        />

        <div className="relative">
          <div className="flex items-center justify-between gap-3">
            <Link to="/" className="inline-flex items-center gap-2.5" aria-label={t('shell.brandAria')}>
              <img src="/creo-icon.png" alt="" className="h-12 w-12 rounded-xl shadow-sm" />
              <span className="text-2xl font-bold tracking-tight text-secondary">Creo</span>
            </Link>
            <LanguageSwitcher />
          </div>
          <h1 className="pv-title mt-7 text-3xl font-bold leading-[1.05] text-secondary sm:text-4xl lg:text-[46px]">
            {t('authPage.heroTitle')}
          </h1>
          <p className="pv-muted mt-5 max-w-md text-base leading-relaxed">
            {t('authPage.heroLede')}
          </p>
        </div>

        <ul className="relative mt-10 space-y-3">
          {heroFeatures.map((feature, index) => (
            <li key={feature.title} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel/70 px-4 py-3 backdrop-blur">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-secondary">{feature.title}</p>
                <p className="pv-muted text-xs leading-relaxed">{feature.body}</p>
              </div>
            </li>
          ))}
        </ul>

        <blockquote className="relative mt-auto rounded-2xl border border-primary/40 bg-panel/60 px-5 py-4 backdrop-blur">
          <p className="pv-title text-sm leading-relaxed text-secondary sm:text-base">
            {t('landing.quote')}
          </p>
          <p className="pv-muted mt-2 text-[11px] font-semibold uppercase tracking-[0.18em]">{t('landing.quoteRef')}</p>
        </blockquote>
      </section>

      <section className="pv-panel flex h-full flex-col rounded-3xl p-7 sm:p-9">
        <h2 className="pv-title text-2xl font-semibold text-secondary sm:text-3xl">
          {showReset ? t('authPage.resetTitle') : t('authPage.welcomeBack')}
        </h2>
        <p className="pv-muted mt-2 text-sm">
          {showReset ? t('authPage.resetSub') : t('authPage.signinSub')}
        </p>

        {showReset ? (
          <>
            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('landing.email')}</span>
                <Input className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('landing.emailPlaceholder')} type="email" autoComplete="email" />
              </label>
              <Button className="w-full" disabled={isLoading} onClick={onResetPassword} type="button">
                {isLoading ? t('common.loading') : t('authPage.resetCta')}
              </Button>
              <button
                type="button"
                onClick={() => { setShowReset(false); setError(''); setInfo('') }}
                className="w-full text-xs font-semibold text-primary hover:text-secondary"
              >
                {t('authPage.backToSignIn')}
              </button>
            </div>
          </>
        ) : (
          <>
            <form onSubmit={onSubmit} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('landing.email')}</span>
                <Input className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('landing.emailPlaceholder')} type="email" autoComplete="email" />
              </label>
              <label className="block">
                <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-primary">
                  <span>{t('landing.password')}</span>
                  <button className="text-[11px] font-semibold normal-case tracking-normal text-primary hover:text-secondary" onClick={() => setShowReset(true)} type="button">
                    {t('landing.forgotPassword')}
                  </button>
                </span>
                <Input className="mt-1.5" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" autoComplete="current-password" />
              </label>

              <Button className="w-full" disabled={isLoading} type="submit">
                {isLoading ? t('common.loading') : t('landing.signIn')}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3" aria-hidden>
              <span className="h-px flex-1 bg-primary/30" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t('landing.or')}</span>
              <span className="h-px flex-1 bg-primary/30" />
            </div>

            <Button className="w-full" disabled={isLoading} onClick={onPasswordlessEmail} type="button" variant="secondary">
              {t('landing.magicCta')}
            </Button>
          </>
        )}

        {(error || info) && (
          <div className="mt-4 space-y-2">
            {error && <p role="alert" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{error}</p>}
            {info && <p role="status" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{info}</p>}
          </div>
        )}

        {(pendingConfirmEmail || linkExpired) && (
          <button
            type="button"
            onClick={onResendConfirmation}
            disabled={isLoading}
            className="mt-3 text-xs font-semibold text-primary hover:text-secondary disabled:opacity-60"
          >
            {t('authPage.resendConfirmation')}
          </button>
        )}

        <p className="pv-muted mt-auto pt-8 text-center text-xs">
          {t('landing.noAccount')}{' '}
          <Link className="font-semibold text-primary hover:text-secondary" to="/">
            {t('authPage.createYours')}
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
