import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
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
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8 sm:px-6">
      <section className="pv-panel rounded-3xl p-7 sm:p-9">
        <Link to="/" className="inline-flex items-center gap-2.5" aria-label={t('shell.brandAria')}>
          <img src="/creo-icon.png" alt="" className="h-10 w-10 rounded-xl shadow-sm" />
          <span className="text-xl font-bold tracking-tight text-secondary">Creo</span>
        </Link>

        <h1 className="pv-title mt-6 text-2xl font-semibold text-secondary sm:text-3xl">
          {t('reset.title')}
        </h1>
        <p className="pv-muted mt-2 text-sm">
          {t('reset.sub')}
        </p>

        {status === 'checking' && (
          <p role="status" className="mt-6 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">
            {t('reset.checking')}
          </p>
        )}

        {status === 'no-session' && (
          <div className="mt-6 space-y-3">
            <p role="alert" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">
              {t('reset.linkInvalid')}
            </p>
            <Link
              to="/auth"
              className="inline-flex w-full items-center justify-center rounded-xl border border-primary bg-panel px-4 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
            >
              {t('reset.requestNew')}
            </Link>
          </div>
        )}

        {(status === 'ready' || status === 'saving' || status === 'done') && (
          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('reset.newPassword')}</span>
              <Input
                className="mt-1.5"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={status !== 'ready'}
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('reset.confirmPassword')}</span>
              <Input
                className="mt-1.5"
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                disabled={status !== 'ready'}
              />
            </label>

            <Button className="w-full" type="submit" disabled={status !== 'ready'}>
              {status === 'saving' ? t('common.saving') : status === 'done' ? t('reset.done') : t('reset.savePassword')}
            </Button>

            {error && (
              <p role="alert" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">
                {error}
              </p>
            )}
            {status === 'done' && (
              <p role="status" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">
                {t('reset.successRedirect')}
              </p>
            )}
          </form>
        )}
      </section>
    </div>
  )
}
