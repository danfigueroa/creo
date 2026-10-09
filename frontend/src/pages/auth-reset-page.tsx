import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { clearRecoveryFlag, getSupabaseClient, hasRecoveryFlag } from '@/lib/supabase'
import { PASSWORD_MIN } from '@/lib/password'
import { useSessionStore } from '@/state/session-store'

type Status = 'checking' | 'ready' | 'no-session' | 'saving' | 'done'

// Só libera a troca quando a sessão nasceu de um link de recuperação: via
// ?token_hash=&type=recovery (template de e-mail) ou pelo evento
// PASSWORD_RECOVERY do fluxo ?code=. Antes qualquer sessão servia, então quem
// pegasse um navegador logado trocava a senha sem saber a atual.
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
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const isRecoveryLink = tokenHash !== null && params.get('type') === 'recovery'

    const markReady = (token: string | null | undefined) => {
      if (!active || !token) return
      setAccessToken(token)
      setStatus('ready')
    }
    const markInvalid = () => {
      if (!active) return
      setStatus((prev) => (prev === 'checking' ? 'no-session' : prev))
    }

    if (isRecoveryLink) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).then(({ data, error: verifyError }) => {
        window.history.replaceState({}, '', window.location.pathname)
        if (verifyError || !data.session) {
          markInvalid()
          return
        }
        markReady(data.session.access_token)
      })
    } else if (hasRecoveryFlag()) {
      supabase.auth.getSession().then(({ data }) => markReady(data.session?.access_token))
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') markReady(session?.access_token)
    })

    const fallback = window.setTimeout(markInvalid, isRecoveryLink ? 8000 : 4000)

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
    if (password.length < PASSWORD_MIN) {
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
    clearRecoveryFlag()
    // Quem pede recuperação pode estar fugindo de uma sessão roubada: derruba
    // as outras e mantém só esta.
    await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
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
                minLength={PASSWORD_MIN}
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
