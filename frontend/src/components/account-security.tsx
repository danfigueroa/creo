import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { parseApiError } from '@/lib/api-error'
import { translateAuthError } from '@/lib/auth-errors'
import { PASSWORD_MIN } from '@/lib/password'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { useToast } from '@/components/toaster'
import { TurnstileWidget, captchaOption, useCaptcha } from '@/components/turnstile'

// E-mail da sessão do Supabase: é ele que confere a senha atual e que recebe
// a confirmação de troca. O backend não devolve e-mail no /profile.
function useSessionEmail(): string {
  const [email, setEmail] = useState('')
  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) return
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? '')
    })
    return () => {
      active = false
    }
  }, [])
  return email
}

type Captcha = ReturnType<typeof useCaptcha>

// Confere a senha atual antes de ação sensível. Um token roubado ou um
// navegador esquecido aberto não bastam para trocar senha ou excluir a conta.
async function verifyCurrentPassword(email: string, password: string, captcha: Captcha): Promise<string | null> {
  const supabase = getSupabaseClient()
  if (!supabase) return 'supabase'
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: captchaOption(captcha.token) })
    if (!error) return null
    const m = (error.message || '').toLowerCase()
    return m.includes('invalid') ? 'wrong' : error.message
  } finally {
    captcha.reset()
  }
}

export function ChangePasswordSection() {
  const { t } = useTranslation()
  const toast = useToast()
  const email = useSessionEmail()
  const captcha = useCaptcha()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    const supabase = getSupabaseClient()
    if (!supabase || !email) {
      setError(t('authErrors.supabaseMissing'))
      return
    }
    if (next.length < PASSWORD_MIN) {
      setError(t('authErrors.passwordTooShort'))
      return
    }
    if (next !== confirm) {
      setError(t('reset.passwordMismatch'))
      return
    }
    if (captcha.enabled && !captcha.token) {
      setError(t('security.captchaPending'))
      return
    }
    setBusy(true)
    try {
      const verify = await verifyCurrentPassword(email, current, captcha)
      if (verify) {
        setError(verify === 'wrong' ? t('security.wrongPassword') : translateAuthError(verify))
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password: next })
      if (updateError) {
        const msg = (updateError.message || '').toLowerCase()
        setError(msg.includes('same as the old') ? t('reset.usePasswordDifferent') : translateAuthError(updateError.message))
        return
      }
      // Senha nova invalida as outras sessões: quem troca por suspeita não
      // quer o outro dispositivo ainda logado.
      await supabase.auth.signOut({ scope: 'others' }).catch(() => undefined)
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.success(t('security.passwordChanged'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pcard" onSubmit={onSubmit}>
      <h2 className="pcard__title">{t('security.passwordTitle')}</h2>
      <p className="pcard__sub">{t('security.passwordSub')}</p>
      <div className="pcard__body">
        <label className="field">
          <span className="field__label">{t('security.currentPassword')}</span>
          <Input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </label>
        <label className="field">
          <span className="field__label">{t('reset.newPassword')}</span>
          <Input
            type="password"
            autoComplete="new-password"
            minLength={PASSWORD_MIN}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            required
          />
          <span className="field__hint">{t('landing.passwordMin', { min: PASSWORD_MIN })}</span>
        </label>
        <label className="field">
          <span className="field__label">{t('reset.confirmPassword')}</span>
          <Input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        <TurnstileWidget captcha={captcha} />
      </div>
      {error && (
        <p role="alert" className="formnote formnote--err" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}
      <div className="pcard__foot">
        <Button type="submit" disabled={busy}>
          {busy ? t('common.saving') : t('security.passwordCta')}
        </Button>
      </div>
    </form>
  )
}

export function ChangeEmailSection() {
  const { t } = useTranslation()
  const email = useSessionEmail()
  const [next, setNext] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    const supabase = getSupabaseClient()
    if (!supabase) {
      setError(t('authErrors.supabaseMissing'))
      return
    }
    const target = next.trim().toLowerCase()
    if (!target || target === email.toLowerCase()) {
      setError(t('security.emailSame'))
      return
    }
    setBusy(true)
    try {
      const { error: updateError } = await supabase.auth.updateUser(
        { email: target },
        { emailRedirectTo: `${window.location.origin}/auth` }
      )
      if (updateError) {
        setError(translateAuthError(updateError.message))
        return
      }
      setInfo(t('security.emailSent', { old: email, next: target }))
      setNext('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="pcard" onSubmit={onSubmit}>
      <h2 className="pcard__title">{t('security.emailTitle')}</h2>
      <p className="pcard__sub">{email ? t('security.emailCurrent', { email }) : t('security.emailSub')}</p>
      <div className="pcard__body">
        <label className="field">
          <span className="field__label">{t('security.newEmail')}</span>
          <Input type="email" autoComplete="email" value={next} onChange={(e) => setNext(e.target.value)} required />
          <span className="field__hint">{t('security.emailHint')}</span>
        </label>
      </div>
      {error && (
        <p role="alert" className="formnote formnote--err" style={{ marginTop: 16 }}>
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="formnote" style={{ marginTop: 16 }}>
          {info}
        </p>
      )}
      <div className="pcard__foot">
        <Button type="submit" disabled={busy}>
          {busy ? t('common.saving') : t('security.emailCta')}
        </Button>
      </div>
    </form>
  )
}

export function DataExportSection() {
  const { t } = useTranslation()
  const toast = useToast()

  const exportData = useMutation({
    mutationFn: async () => {
      const res = await api.get('/me/export', { responseType: 'blob' })
      const url = URL.createObjectURL(res.data as Blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'creo-dados.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    },
    onError: (err) => toast.error(parseApiError(err).message)
  })

  return (
    <section className="pcard">
      <h2 className="pcard__title">{t('security.exportTitle')}</h2>
      <p className="pcard__sub">{t('security.exportSub')}</p>
      <div className="pcard__body">
        <button type="button" className="btn btn--ghost-out" disabled={exportData.isPending} onClick={() => exportData.mutate()}>
          {exportData.isPending ? t('common.loading') : t('security.exportCta')}
        </button>
      </div>
    </section>
  )
}

type SoleAdminGroup = { id: string; name: string }

export function DeleteAccountSection({ username }: { username?: string }) {
  const { t } = useTranslation()
  const toast = useToast()
  const navigate = useNavigate()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const email = useSessionEmail()
  const captcha = useCaptcha()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [typed, setTyped] = useState('')
  const [error, setError] = useState('')
  const [blockingGroups, setBlockingGroups] = useState<SoleAdminGroup[]>([])
  const [busy, setBusy] = useState(false)

  const confirmMatches = Boolean(username) && typed.trim().replace(/^@/, '').toLowerCase() === username?.toLowerCase()

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setBlockingGroups([])
    if (!confirmMatches || !email) return
    if (captcha.enabled && !captcha.token) {
      setError(t('security.captchaPending'))
      return
    }
    setBusy(true)
    try {
      const verify = await verifyCurrentPassword(email, password, captcha)
      if (verify) {
        setError(verify === 'wrong' ? t('security.wrongPassword') : translateAuthError(verify))
        return
      }
      try {
        await api.delete('/me')
      } catch (err) {
        const parsed = parseApiError(err)
        if (parsed.code === 'LAST_ADMIN') {
          setBlockingGroups((parsed.details?.groups as SoleAdminGroup[] | undefined) ?? [])
          setError(t('security.deleteSoleAdmin'))
        } else {
          setError(parsed.message)
        }
        return
      }
      // O usuário já não existe no Supabase: só limpa a sessão local.
      await getSupabaseClient()?.auth.signOut({ scope: 'local' }).catch(() => undefined)
      setAccessToken(null)
      toast.success(t('security.deleted'))
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pcard pcard--danger">
      <h2 className="pcard__title">{t('security.deleteTitle')}</h2>
      <p className="pcard__sub">{t('security.deleteSub')}</p>

      {!open ? (
        <div className="pcard__body">
          <button type="button" className="btn btn--ghost-out btn--danger" onClick={() => setOpen(true)}>
            {t('security.deleteOpen')}
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit}>
          <div className="pcard__body">
            <ul className="pcard__list-plain">
              <li>{t('security.deleteWhat1')}</li>
              <li>{t('security.deleteWhat2')}</li>
              <li>{t('security.deleteWhat3')}</li>
            </ul>
            <label className="field">
              <span className="field__label">{t('security.currentPassword')}</span>
              <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </label>
            <label className="field">
              <span className="field__label">{t('security.deleteTypeLabel', { username: username ?? '' })}</span>
              <Input value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} required />
            </label>
            <TurnstileWidget captcha={captcha} />
          </div>
          {error && (
            <div role="alert" className="formnote formnote--err" style={{ marginTop: 16 }}>
              {error}
              {blockingGroups.length > 0 && (
                <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                  {blockingGroups.map((g) => (
                    <li key={g.id}>
                      <Link to={`/groups/${g.id}`}>{g.name}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <div className="pcard__foot">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <button type="submit" className="btn btn--danger-solid" disabled={busy || !confirmMatches || !password}>
              {busy ? t('security.deleting') : t('security.deleteCta')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
