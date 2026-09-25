import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropsWithChildren, useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { domMax, LazyMotion, MotionConfig } from 'motion/react'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { ToasterProvider } from '@/components/toaster'
import { ConfirmDialogProvider } from '@/components/confirm-dialog'
import i18n from '@/lib/i18n'

export function AppProviders({ children }: PropsWithChildren) {
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000
          }
        }
      })
  )

  useEffect(() => {
    const supabase = getSupabaseClient()
    if (!supabase) {
      return
    }

    let isMounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) {
        return
      }
      setAccessToken(data.session?.access_token ?? null)
    })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null)
    })

    return () => {
      isMounted = false
      data.subscription.unsubscribe()
    }
  }, [setAccessToken])

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>
        {/* domMax (e não domAnimation) porque toasts e feed usam animação de
            layout. `strict` faz qualquer `motion.*` acidental quebrar em dev —
            use sempre `m.*`, que pega as features daqui.
            reducedMotion="user" desliga transform/layout para quem pediu
            menos movimento no sistema; o CSS tem o equivalente em index.css. */}
        <LazyMotion features={domMax} strict>
          <MotionConfig reducedMotion="user">
            <ToasterProvider>
              <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
            </ToasterProvider>
          </MotionConfig>
        </LazyMotion>
      </QueryClientProvider>
    </I18nextProvider>
  )
}
