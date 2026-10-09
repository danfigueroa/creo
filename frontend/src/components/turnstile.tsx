import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

// Cloudflare Turnstile (grátis). O token vai em `options.captchaToken` das
// chamadas de auth e o Supabase valida com o secret configurado no painel.
// Sem VITE_TURNSTILE_SITE_KEY o widget não aparece e as chamadas seguem sem
// token — é o modo de dev; em produção o captcha só pode ser ligado no
// Supabase depois que este front estiver no ar com a chave.
const SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined) || ''
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string
  reset: (id: string) => void
  remove: (id: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (scriptPromise) return scriptPromise
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile')))
    script.onerror = () => {
      scriptPromise = null
      reject(new Error('turnstile'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

export const captchaEnabled = SITE_KEY !== ''

// useCaptcha devolve o token atual e um reset. O token é de uso único: toda
// chamada de auth que o consome precisa chamar reset() depois, com sucesso ou
// erro, para o widget gerar outro.
export function useCaptcha() {
  const [token, setToken] = useState<string | null>(null)
  const widgetId = useRef<string | null>(null)

  const reset = useCallback(() => {
    setToken(null)
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
  }, [])

  return { token, setToken, reset, widgetId, enabled: captchaEnabled }
}

// Spread em `options` das chamadas do Supabase.
export function captchaOption(token: string | null): { captchaToken?: string } {
  return token ? { captchaToken: token } : {}
}

type WidgetProps = {
  captcha: ReturnType<typeof useCaptcha>
}

export function TurnstileWidget({ captcha }: WidgetProps) {
  const { i18n } = useTranslation()
  const ref = useRef<HTMLDivElement | null>(null)
  const { setToken, widgetId } = captcha

  useEffect(() => {
    if (!captchaEnabled || !ref.current) return
    let cancelled = false
    const el = ref.current
    loadTurnstile()
      .then((ts) => {
        if (cancelled) return
        widgetId.current = ts.render(el, {
          sitekey: SITE_KEY,
          theme: 'light',
          size: 'flexible',
          language: i18n.language.toLowerCase(),
          callback: (t: string) => setToken(t),
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null)
        })
      })
      .catch(() => setToken(null))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
      setToken(null)
    }
  }, [i18n.language, setToken, widgetId])

  if (!captchaEnabled) return null
  return <div ref={ref} className="captcha" />
}
