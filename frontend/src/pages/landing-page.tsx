import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import type { Tradition } from '@/lib/traditions'

type AuthTab = 'entrar' | 'criar'

const FEATURES = [
  { n: '01', title: 'Pedidos de oração', desc: 'Compartilhe intenções com privacidade granular — público, só seu grupo, ou anônimo.' },
  { n: '02', title: 'Rezei por você', desc: 'Acompanhe quem rezou pela sua intenção — sem comentários, só presença.' },
  { n: '03', title: 'Sua comunidade', desc: 'Pastorais, células e movimentos num só espaço acolhedor.' }
]

function translateAuthError(raw: string): string {
  const m = (raw || '').toLowerCase()
  if (m.includes('email not confirmed')) return 'Você ainda não confirmou seu e-mail. Abra o link que enviamos.'
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) return 'E-mail ou senha incorretos.'
  if (m.includes('user already registered') || m.includes('already registered')) return 'Já existe uma conta com este e-mail. Tente entrar.'
  if (m.includes('password should be at least')) return 'A senha precisa ter ao menos 6 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um instante.'
  return raw || 'Algo deu errado. Tente novamente em instantes.'
}

export function LandingPage() {
  const navigate = useNavigate()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const [tab, setTab] = useState<AuthTab>('entrar')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [name, setName] = useState('')
  const [tradition, setTradition] = useState<Tradition>('CATHOLIC')
  const [magic, setMagic] = useState(false)
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

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
      setError('Configuração do Supabase ausente.')
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
        setError('Não foi possível iniciar sessão.')
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
      setError('Configuração do Supabase ausente.')
      return
    }
    if (!name.trim()) {
      setError('Como podemos te chamar? Preencha seu nome.')
      return
    }
    setIsLoading(true)
    try {
      window.localStorage.setItem('creo-pending-tradition', tradition)
      const { error: signErr } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          emailRedirectTo: `${window.location.origin}/auth`,
          data: { display_name: name.trim(), tradition }
        }
      })
      if (signErr) {
        setError(translateAuthError(signErr.message))
        return
      }
      setInfo(`Conta criada. Enviamos um link de confirmação para ${email.trim()}. Abra-o pra ativar.`)
    } finally {
      setIsLoading(false)
    }
  }

  async function onMagicLink() {
    setError('')
    setInfo('')
    if (!email) {
      setError('Informe seu e-mail para receber o link de acesso.')
      return
    }
    const supabase = getSupabaseClient()
    if (!supabase) {
      setError('Configuração do Supabase ausente.')
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
      setInfo(`Enviamos um link de acesso para ${email.trim()}.`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="app app--welcome" data-screen-label="Welcome">
      <div className="welcome">
        <section className="welcome__hero" aria-label="Apresentação">
          <div className="welcome__brand">
            <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
            <span className="brand-word">Creo</span>
          </div>

          <h1 className="welcome__title">
            Sua comunidade
            <br />
            unida em oração,
            <br />
            <em>todos os dias.</em>
          </h1>

          <p className="welcome__lede">
            Compartilhe intenções, acompanhe pedidos de amigos e grupos e fortaleça sua comunidade
            de fé — católica ou evangélica — em um ambiente moderno e acolhedor.
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

          <figure className="welcome__quote">
            <blockquote>
              "Onde dois ou três estiverem reunidos em meu nome, ali estarei eu, no meio deles."
            </blockquote>
            <figcaption>Mateus 18,20</figcaption>
          </figure>
        </section>

        <section className="welcome__auth" aria-label="Acesso">
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
                Entrar
              </button>
              <button
                type="button"
                data-tab="criar"
                className={`welcome__tab ${tab === 'criar' ? 'is-on' : ''}`}
                onClick={() => setTab('criar')}
                role="tab"
                aria-selected={tab === 'criar'}
              >
                Criar conta
              </button>
              <span
                className="welcome__tab-ink"
                style={{ transform: `translateX(${ink.x}px)`, width: ink.w }}
              />
            </div>

            {tab === 'entrar' ? (
              <>
                <h2 className="welcome__auth-title">Bem-vindo de volta.</h2>
                <p className="welcome__auth-sub">
                  Acesse com e-mail e senha — ou receba um link único por e-mail.
                </p>

                <form className="welcome__form" onSubmit={onSignIn}>
                  <label className="welcome__field">
                    <span className="welcome__label">E-mail</span>
                    <input
                      type="email"
                      placeholder="voce@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>

                  <label className="welcome__field">
                    <div className="welcome__label-row">
                      <span className="welcome__label">Senha</span>
                      <Link className="welcome__link-quiet" to="/auth?reset=1">
                        Esqueceu a senha?
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
                    {isLoading ? 'Entrando…' : 'Entrar'}
                  </button>

                  <div className="welcome__or">
                    <span>ou</span>
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
                    {magic ? 'Link enviado — confira sua caixa de entrada' : 'Receber link de acesso por e-mail'}
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
                  Ainda não tem conta?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setTab('criar')
                    }}
                  >
                    Crie a sua.
                  </a>
                </p>
              </>
            ) : (
              <>
                <h2 className="welcome__auth-title">Crie sua conta.</h2>
                <p className="welcome__auth-sub">
                  Em menos de um minuto. Você pode começar a rezar com a comunidade ainda hoje.
                </p>

                <form className="welcome__form" onSubmit={onSignUp}>
                  <label className="welcome__field">
                    <span className="welcome__label">Nome</span>
                    <input
                      type="text"
                      placeholder="Como você quer ser chamado"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </label>
                  <label className="welcome__field">
                    <span className="welcome__label">E-mail</span>
                    <input
                      type="email"
                      placeholder="voce@exemplo.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </label>
                  <label className="welcome__field">
                    <span className="welcome__label">Senha</span>
                    <input
                      type="password"
                      placeholder="Mínimo de 8 caracteres"
                      value={pass}
                      onChange={(e) => setPass(e.target.value)}
                      required
                    />
                  </label>

                  <div className="welcome__field">
                    <span className="welcome__label">Tradição</span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 6 }}>
                      {(['CATHOLIC', 'EVANGELICAL'] as const).map((t) => {
                        const active = tradition === t
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTradition(t)}
                            aria-pressed={active}
                            style={{
                              padding: '10px 12px',
                              borderRadius: 'var(--r-2)',
                              border: `1.5px solid ${active ? 'var(--ink)' : 'var(--line-2)'}`,
                              background: active ? 'var(--ink)' : 'transparent',
                              color: active ? 'var(--bg)' : 'var(--ink)',
                              fontSize: 13,
                              fontWeight: 600,
                              fontFamily: 'var(--sans)',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'border-color 0.15s, background 0.15s, color 0.15s'
                            }}
                          >
                            {t === 'CATHOLIC' ? 'Católico' : 'Evangélico'}
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <button type="submit" disabled={isLoading} className="btn btn--primary welcome__cta">
                    {isLoading ? 'Criando…' : 'Criar conta'}
                  </button>

                  <p className="welcome__terms">
                    Ao continuar, você concorda com os termos e a política de privacidade.
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
                  Já tem conta?{' '}
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault()
                      setTab('entrar')
                    }}
                  >
                    Entrar.
                  </a>
                </p>
              </>
            )}
          </div>

          <div className="welcome__assure">
            <span className="welcome__assure-dot" aria-hidden />
            Suas intenções são privadas por padrão.
          </div>
        </section>
      </div>
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
