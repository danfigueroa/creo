import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'

type Status = 'checking' | 'ready' | 'no-session' | 'saving' | 'done'

export function AuthResetPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const supabase = getSupabaseClient()

  const [status, setStatus] = useState<Status>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!supabase) {
      setStatus('no-session')
      return
    }
    let active = true

    const evaluate = (token: string | null | undefined) => {
      if (!active) return
      if (token) {
        setAccessToken(token)
        setStatus('ready')
      } else {
        setStatus((prev) => (prev === 'checking' ? 'no-session' : prev))
      }
    }

    supabase.auth.getSession().then(({ data }) => evaluate(data.session?.access_token))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      evaluate(session?.access_token)
    })

    const fallback = window.setTimeout(() => {
      if (!active) return
      setStatus((prev) => (prev === 'checking' ? 'no-session' : prev))
    }, 4000)

    return () => {
      active = false
      sub.subscription.unsubscribe()
      window.clearTimeout(fallback)
    }
  }, [setAccessToken, supabase])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!supabase) {
      setError(t('authErrors.supabaseMissing'))
      return
    }
    if (password.length < 6) {
      setError(t('authErrors.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      setError(t('reset.passwordMismatch'))
      return
    }
    setStatus('saving')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setStatus('ready')
      const msg = (updateError.message || '').toLowerCase()
      if (msg.includes('password should be at least')) {
        setError(t('authErrors.passwordTooShort'))
      } else if (msg.includes('same as the old')) {
        setError(t('reset.usePasswordDifferent'))
      } else {
        setError(updateError.message || t('reset.updateError'))
      }
      return
    }
    setStatus('done')
    setTimeout(() => navigate('/feed', { replace: true }), 600)
  }

  return (
    <div className="auth-solo">
      <div className="auth-solo__top">
        <Link to="/" className="welcome__brand" aria-label={t('shell.brandAria')}>
          <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
          <span className="brand-word">Creo</span>
        </Link>
      </div>

      <section className="welcome__auth-card">
        <h1 className="welcome__auth-title">{t('reset.title')}</h1>
        <p className="welcome__auth-sub">{t('reset.sub')}</p>

        {status === 'checking' && (
          <p role="status" className="canvas__status">
            {t('reset.checking')}
          </p>
        )}

        {status === 'no-session' && (
          <div className="welcome__form">
            <p role="alert" className="canvas__alert">
              {t('reset.linkInvalid')}
            </p>
            <Link to="/auth?reset=1" className="btn btn--ghost-out welcome__cta" style={{ textAlign: 'center', textDecoration: 'none' }}>
              {t('reset.requestNew')}
            </Link>
          </div>
        )}

        {(status === 'ready' || status === 'saving' || status === 'done') && (
          <form onSubmit={onSubmit} className="welcome__form">
            <label className="welcome__field">
              <span className="welcome__label">{t('reset.newPassword')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={status !== 'ready'}
              />
            </label>
            <label className="welcome__field">
              <span className="welcome__label">{t('reset.confirmPassword')}</span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                disabled={status !== 'ready'}
              />
            </label>

            <button type="submit" className="btn btn--primary welcome__cta" disabled={status !== 'ready'}>
              {status === 'saving' ? t('common.saving') : status === 'done' ? t('reset.done') : t('reset.savePassword')}
            </button>

            {error && <p role="alert" className="canvas__alert">{error}</p>}
            {status === 'done' && <p role="status" className="canvas__status">{t('reset.successRedirect')}</p>}
          </form>
        )}
      </section>
    </div>
  )
}
