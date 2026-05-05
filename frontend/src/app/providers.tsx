import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PropsWithChildren, useEffect, useState } from 'react'
import { getSupabaseClient } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { ToasterProvider } from '@/components/toaster'
import { ConfirmDialogProvider } from '@/components/confirm-dialog'

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
    <QueryClientProvider client={client}>
      <ToasterProvider>
        <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
      </ToasterProvider>
    </QueryClientProvider>
  )
}
