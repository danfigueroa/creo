import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { api } from '@/lib/api'
import { Tradition, traditionOptions } from '@/lib/traditions'

type AuthMode = 'signin' | 'signup'

function translateAuthError(raw: string): string {
  const message = (raw || '').toLowerCase()
  if (message.includes('email not confirmed')) {
    return 'Você ainda não confirmou seu e-mail. Abra o link que enviamos na sua caixa de entrada — ou peça um novo abaixo.'
  }
  if (message.includes('invalid login credentials') || message.includes('invalid credentials')) {
    return 'E-mail ou senha incorretos.'
  }
  if (message.includes('user already registered') || message.includes('already registered')) {
    return 'Já existe uma conta com este e-mail. Tente entrar em vez de criar.'
  }
  if (message.includes('password should be at least')) {
    return 'A senha precisa ter ao menos 6 caracteres.'
  }
  if (message.includes('rate limit') || message.includes('too many')) {
    return 'Muitas tentativas. Aguarde um instante e tente de novo.'
  }
  if (message.includes('signup') && message.includes('disabled')) {
    return 'Cadastros estão desativados no momento.'
  }
  if (message.includes('otp') && (message.includes('expired') || message.includes('invalid'))) {
    return 'Este link expirou ou já foi usado. Peça um novo abaixo.'
  }
  return raw || 'Algo deu errado. Tente novamente em instantes.'
}

function translateCallbackError(code: string, description: string): string {
  const desc = (description || '').toLowerCase()
  const c = (code || '').toLowerCase()
  if (desc.includes('expired') || c.includes('expired')) {
    return 'Este link expirou. Peça um novo abaixo e tente novamente.'
  }
  if (desc.includes('already') || desc.includes('used') || c === 'access_denied') {
    return 'Este link já foi usado ou não é mais válido. Se já confirmou sua conta, tente entrar.'
  }
  if (description) {
    return decodeURIComponent(description.replace(/\+/g, ' '))
  }
  return 'O link de e-mail não pôde ser validado. Peça um novo abaixo.'
}

export function AuthPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [tradition, setTradition] = useState<Tradition>('CATHOLIC')
  const [mode, setMode] = useState<AuthMode>('signin')
  const [isLoading, setIsLoading] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [pendingConfirmEmail, setPendingConfirmEmail] = useState<string | null>(null)
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

    const redirectIfSession = async (token: string | null | undefined) => {
      if (!active || !token) return
      setAccessToken(token)
      const pendingTradition = window.localStorage.getItem('creo-pending-tradition')
      if (pendingTradition) {
        try {
          await api.patch('/profile/tradition', { tradition: pendingTradition })
        } catch {
          // best-effort
        }
        window.localStorage.removeItem('creo-pending-tradition')
      }
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
        setError('Configuração do Supabase ausente. Avise o time pra conferir as variáveis de ambiente.')
        return
      }
      if (mode === 'signup') {
        const normalizedUsername = username.trim().replace(/^@+/, '').toLowerCase()
        const normalizedDisplayName = displayName.trim()
        if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 80) {
          setError('Informe um nome de exibição entre 2 e 80 caracteres.')
          return
        }
        if (!/^[a-z0-9_]{3,30}$/.test(normalizedUsername)) {
          setError('Use um @username de 3 a 30 caracteres, apenas letras minúsculas, números e _.')
          return
        }
        if (!email.trim() || password.length < 6) {
          setError('Informe um e-mail válido e uma senha com ao menos 6 caracteres.')
          return
        }

        try {
          const availability = await api.get<{ available: boolean }>('/username-availability', {
            params: { username: normalizedUsername }
          })
          if (!availability.data.available) {
            setError('Este @username já está em uso.')
            return
          }
        } catch {
          // backend pode estar fora — segue o cadastro; conflito real volta como erro do Supabase ou na primeira request autenticada
        }

        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
            data: {
              username: normalizedUsername,
              display_name: normalizedDisplayName,
              tradition
            }
          }
        })
        if (signUpError) {
          setError(translateAuthError(signUpError.message))
          return
        }
        setPendingConfirmEmail(email.trim())
        setInfo(
          `Conta criada. Enviamos um link de confirmação para ${email.trim()}. Confira sua caixa de entrada (e a pasta de spam) e clique no botão para ativar sua conta.`
        )
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
        setError('Não foi possível iniciar sessão. Tente novamente em instantes.')
        return
      }

      setAccessToken(token)
      navigate(nextPath, { replace: true })
    } catch (err: any) {
      const message = err?.message || ''
      if (message.toLowerCase().includes('network')) {
        setError('Não conseguimos falar com o servidor. Verifique sua conexão e tente de novo.')
      } else {
        setError('Algo deu errado. Tente novamente em instantes.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  async function onPasswordlessEmail() {
    setError('')
    setInfo('')
    if (!email) {
      setError('Informe seu e-mail para receber o link de acesso.')
      return
    }
    if (!supabase) {
      setError('Configuração do Supabase ausente no frontend.')
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
      setInfo('Enviamos um e-mail com link de acesso único.')
    } finally {
      setIsLoading(false)
    }
  }

  async function onResetPassword() {
    setError('')
    setInfo('')
    if (!email) {
      setError('Informe seu e-mail para redefinir a senha.')
      return
    }
    if (!supabase) {
      setError('Configuração do Supabase ausente no frontend.')
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
      setInfo('E-mail de redefinição enviado. Confira sua caixa de entrada (e o spam).')
    } finally {
      setIsLoading(false)
    }
  }

  async function onResendConfirmation() {
    setError('')
    if (!supabase) {
      setError('Configuração do Supabase ausente no frontend.')
      return
    }
    const target = pendingConfirmEmail || email.trim()
    if (!target) {
      setError('Informe seu e-mail para reenviarmos o link de confirmação.')
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
      setInfo(`Reenviamos o link de confirmação para ${target}. Pode levar até 1 minuto.`)
    } finally {
      setIsLoading(false)
    }
  }

  const heroFeatures = [
    { title: 'Pedidos de oração', body: 'Compartilhe intenções com amigos e grupos.' },
    { title: 'Comunidade unida', body: 'Pastorais, células e movimentos em um só espaço.' },
    { title: 'Ambiente acolhedor', body: 'Moderação ativa para conviver em paz.' }
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
          <Link to="/" className="inline-flex items-center gap-2.5" aria-label="Creo — ir para o início">
            <img src="/creo-icon.png" alt="" className="h-12 w-12 rounded-xl shadow-sm" />
            <span className="text-2xl font-bold tracking-tight text-secondary">Creo</span>
          </Link>
          <h1 className="pv-title mt-7 text-3xl font-bold leading-[1.05] text-secondary sm:text-4xl lg:text-[46px]">
            Sua comunidade unida em oração, todos os dias.
          </h1>
          <p className="pv-muted mt-5 max-w-md text-base leading-relaxed">
            Compartilhe intenções, acompanhe pedidos de amigos e grupos e fortaleça sua comunidade de fé — católica ou evangélica — em um ambiente moderno e acolhedor.
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
            “Onde dois ou três estiverem reunidos em meu nome, ali estarei eu, no meio deles.”
          </p>
          <p className="pv-muted mt-2 text-[11px] font-semibold uppercase tracking-[0.18em]">Mateus 18,20</p>
        </blockquote>
      </section>

      <section className="pv-panel flex h-full flex-col rounded-3xl p-7 sm:p-9">
        <div className="inline-flex w-full rounded-full border border-primary bg-panel p-1">
          <button
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'signin' ? 'bg-primary text-onPrimary shadow-[0_8px_18px_-10px_var(--fx-ring)]' : 'text-primary hover:bg-primary/5'}`}
            onClick={() => setMode('signin')}
            type="button"
          >
            Entrar
          </button>
          <button
            className={`flex-1 rounded-full px-4 py-2 text-sm font-semibold transition ${mode === 'signup' ? 'bg-primary text-onPrimary shadow-[0_8px_18px_-10px_var(--fx-ring)]' : 'text-primary hover:bg-primary/5'}`}
            onClick={() => setMode('signup')}
            type="button"
          >
            Criar conta
          </button>
        </div>

        <h2 className="pv-title mt-7 text-2xl font-semibold text-secondary sm:text-3xl">
          {mode === 'signin' ? 'Bem-vindo de volta' : 'Crie sua conta'}
        </h2>
        <p className="pv-muted mt-2 text-sm">
          {mode === 'signin'
            ? 'Acesse com e-mail e senha — ou receba um link único por e-mail.'
            : 'Em poucos passos você se conecta à sua comunidade de oração.'}
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {mode === 'signup' && (
            <>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Nome de exibição</span>
                <Input className="mt-1.5" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Como quer ser chamado(a)" />
              </label>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">@username</span>
                <Input className="mt-1.5" value={username} onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))} placeholder="apelido único, sem espaços" />
              </label>
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">Tradição</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {traditionOptions.map((option) => {
                    const active = tradition === option.value
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setTradition(option.value)}
                        className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${active ? 'border-primary bg-primary/10 shadow-[0_10px_24px_-16px_var(--fx-ring)]' : 'border-primary bg-panel hover:bg-primary/5'}`}
                        aria-pressed={active}
                      >
                        <span className="text-xl leading-none" aria-hidden>{option.emoji}</span>
                        <span className="min-w-0">
                          <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-secondary'}`}>{option.label}</span>
                          <span className="block text-[11px] leading-snug text-primary/80">{option.description}</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}

          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">E-mail</span>
            <Input className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="voce@exemplo.com" type="email" autoComplete="email" />
          </label>
          <label className="block">
            <span className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <span>Senha</span>
              {mode === 'signin' && (
                <button className="text-[11px] font-semibold normal-case tracking-normal text-primary hover:text-secondary" onClick={onResetPassword} type="button">
                  Esqueceu a senha?
                </button>
              )}
            </span>
            <Input className="mt-1.5" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
          </label>

          <Button className="w-full" disabled={isLoading} type="submit">
            {isLoading ? 'Carregando…' : mode === 'signin' ? 'Entrar' : 'Criar conta'}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3" aria-hidden>
          <span className="h-px flex-1 bg-primary/30" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">ou</span>
          <span className="h-px flex-1 bg-primary/30" />
        </div>

        <Button className="w-full" disabled={isLoading} onClick={onPasswordlessEmail} type="button" variant="secondary">
          Receber link de acesso por e-mail
        </Button>

        {(error || info) && (
          <div className="mt-4 space-y-2">
            {error && <p role="alert" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{error}</p>}
            {info && <p role="status" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{info}</p>}
          </div>
        )}

        {(pendingConfirmEmail || (error && error.toLowerCase().includes('expirou'))) && (
          <button
            type="button"
            onClick={onResendConfirmation}
            disabled={isLoading}
            className="mt-3 text-xs font-semibold text-primary hover:text-secondary disabled:opacity-60"
          >
            Reenviar e-mail de confirmação
          </button>
        )}

        <p className="pv-muted mt-auto pt-8 text-center text-xs">
          {mode === 'signin' ? (
            <>Ainda não tem conta? <button className="font-semibold text-primary hover:text-secondary" onClick={() => setMode('signup')} type="button">Crie a sua</button>.</>
          ) : (
            <>Já tem conta? <button className="font-semibold text-primary hover:text-secondary" onClick={() => setMode('signin')} type="button">Entrar</button>.</>
          )}
        </p>
      </section>
    </div>
  )
}
