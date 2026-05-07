import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { PageShell } from '@/components/page-shell'
import { api } from '@/lib/api'
import { FeedCard, flattenFeedItem, type FeedCardItem } from '@/components/feed-card'
import { FeedSkeleton } from '@/components/feed-skeleton'
import { Avatar } from '@/components/avatar'
import { NewRequestModal } from '@/components/new-request-modal'
import { prayerActionsFor, type Tradition } from '@/lib/traditions'

type FeedScope = 'home' | 'public' | 'groups' | 'friends'
type ProfileMini = { id: string; displayName?: string; username?: string; avatarUrl?: string | null; tradition?: Tradition }
type GroupLite = { id: string; name: string }
type FeedPagination = { page: number; pageSize: number; total: number; totalPages: number }
type RawFeedResponse = { items: Parameters<typeof flattenFeedItem>[0][]; pagination: FeedPagination }
type FeedResponse = { items: FeedCardItem[]; pagination: FeedPagination }

const tabs: Array<{ scope: FeedScope; label: string; endpoint: string; requiresAuth: boolean }> = [
  { scope: 'home', label: 'Principal', endpoint: '/feed/home', requiresAuth: true },
  { scope: 'groups', label: 'Grupos', endpoint: '/feed/groups', requiresAuth: true },
  { scope: 'friends', label: 'Amigos', endpoint: '/feed/friends', requiresAuth: true },
  { scope: 'public', label: 'Público', endpoint: '/feed/public', requiresAuth: false }
]

const categoryLabel: Record<string, string> = {
  HEALTH: 'Saúde',
  FAMILY: 'Família',
  WORK: 'Trabalho',
  GRIEF: 'Luto',
  THANKSGIVING: 'Ação de graças',
  OTHER: 'Outros'
}

const feedPageSize = 10

function formatPostDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function FeedPage() {
  const queryClient = useQueryClient()
  const [lastPrayerHit, setLastPrayerHit] = useState<{ requestID: string; actionType: string; fxID: number } | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const rawScope = searchParams.get('scope') as FeedScope | null
  const scope: FeedScope = rawScope && tabs.some((tab) => tab.scope === rawScope) ? rawScope : 'home'
  const rawPage = Number.parseInt(searchParams.get('page') || '1', 10)
  const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage
  const activeTab = tabs.find((tab) => tab.scope === scope) ?? tabs[0]

  const fetchFeed = async (targetScope: FeedScope, targetPage: number): Promise<FeedResponse> => {
    const targetTab = tabs.find((tab) => tab.scope === targetScope) ?? tabs[0]
    const targetOffset = (targetPage - 1) * feedPageSize
    const res = await api.get<RawFeedResponse>(targetTab.endpoint, {
      params: { limit: feedPageSize, offset: targetOffset }
    })
    return {
      items: res.data.items.map(flattenFeedItem),
      pagination: res.data.pagination
    }
  }

  const query = useQuery({
    queryKey: ['feed', scope, page],
    queryFn: async () => fetchFeed(scope, page),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    gcTime: 5 * 60_000
  })
  const profileQuery = useQuery({
    queryKey: ['profile', 'feed'],
    queryFn: async () => {
      const res = await api.get<ProfileMini>('/profile')
      return res.data
    }
  })
  const prayMutation = useMutation({
    mutationFn: async ({ requestID, actionType }: { requestID: string; actionType: string }) => {
      await api.post(`/requests/${requestID}/pray`, { actionType })
    },
    onMutate: async ({ requestID, actionType }) => {
      await queryClient.cancelQueries({ queryKey: ['feed', scope, page] })
      const previous = queryClient.getQueryData<FeedResponse>(['feed', scope, page])
      if (previous) {
        queryClient.setQueryData<FeedResponse>(['feed', scope, page], {
          ...previous,
          items: previous.items.map((it) =>
            it.kind === 'PRAYER_REQUEST' && it.id === requestID
              ? {
                  ...it,
                  prayedCount: it.prayedCount + 1,
                  prayerTypeCounts: {
                    ...(it.prayerTypeCounts ?? {}),
                    [actionType]: (it.prayerTypeCounts?.[actionType] ?? 0) + 1
                  }
                }
              : it
          )
        })
      }
      setLastPrayerHit({ requestID, actionType, fxID: Date.now() })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['feed', scope, page], ctx.previous)
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['feed'] })
    }
  })
  const groupsLookupQuery = useQuery({
    queryKey: ['feed', 'group-lookup'],
    enabled: Boolean(profileQuery.data?.id),
    queryFn: async () => {
      const res = await api.get<{ items: GroupLite[] }>('/groups')
      return res.data.items ?? []
    }
  })

  const groupNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const group of groupsLookupQuery.data ?? []) {
      map.set(group.id, group.name)
    }
    return map
  }, [groupsLookupQuery.data])

  const prayerActions = useMemo(
    () => prayerActionsFor(profileQuery.data?.tradition ?? 'CATHOLIC'),
    [profileQuery.data?.tradition]
  )

  const feedData = query.data
  const items = feedData?.items ?? []
  const totalPages = Math.max(feedData?.pagination?.totalPages ?? 1, 1)
  const isUnauthorized = (query.error as any)?.response?.status === 401
  const showSkeleton = query.isLoading && !feedData

  useEffect(() => {
    if (!lastPrayerHit) {
      return
    }
    const timer = window.setTimeout(() => setLastPrayerHit(null), 900)
    return () => window.clearTimeout(timer)
  }, [lastPrayerHit])

  useEffect(() => {
    const canPrefetchProtectedTabs = Boolean(profileQuery.data?.id)
    for (const tab of tabs) {
      if (tab.scope === scope) {
        continue
      }
      if (tab.requiresAuth && !canPrefetchProtectedTabs) {
        continue
      }
      queryClient.prefetchQuery({
        queryKey: ['feed', tab.scope, page],
        queryFn: () => fetchFeed(tab.scope, page),
        staleTime: 30_000
      })
    }
  }, [scope, page, profileQuery.data?.id, queryClient])

  useEffect(() => {
    if (isUnauthorized) {
      return
    }
    if (query.isLoading) {
      return
    }
    if (feedData && page >= totalPages) {
      return
    }
    const nextPage = page + 1
    queryClient.prefetchQuery({
      queryKey: ['feed', scope, nextPage],
      queryFn: () => fetchFeed(scope, nextPage),
      staleTime: 30_000
    })
  }, [scope, page, totalPages, isUnauthorized, query.isLoading, feedData, queryClient])

  const changeScope = (nextScope: FeedScope) => {
    setSearchParams({ scope: nextScope, page: '1' })
  }

  const goToPage = (target: number) => {
    const nextPage = Math.min(Math.max(target, 1), totalPages)
    setSearchParams({ scope, page: String(nextPage) })
  }

  const paginationStart = Math.max(1, page - 2)
  const paginationEnd = Math.min(totalPages, paginationStart + 4)
  const pageNumbers = Array.from({ length: paginationEnd - paginationStart + 1 }, (_, idx) => paginationStart + idx)

  const handlePray = useCallback(
    (requestID: string, actionType: string) => {
      prayMutation.mutate({ requestID, actionType })
    },
    [prayMutation]
  )

  return (
    <PageShell>
      <div>
        <header className="border-b border-primary/20">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Feed social</p>
              <h1 className="pv-title mt-1 text-xl font-bold text-secondary sm:text-2xl">Intenções e pedidos de oração</h1>
            </div>
            {query.isFetching && !query.isLoading && (
              <span className="mb-1 text-[11px] text-primary/70">Atualizando…</span>
            )}
          </div>
          <nav className="mt-3 flex overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden" aria-label="Escopo do feed">
            {tabs.map((tab) => {
              const active = tab.scope === scope
              return (
                <button
                  key={tab.scope}
                  type="button"
                  onClick={() => changeScope(tab.scope)}
                  className={`pv-tab-underline ${active ? 'pv-tab-underline-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  {tab.label}
                </button>
              )
            })}
          </nav>
        </header>

        {profileQuery.data?.id && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="pv-compose-box group flex w-full items-start gap-3 border-b border-primary/20 py-5 text-left sm:gap-4 sm:py-6"
          >
            <Avatar
              user={{
                displayName: profileQuery.data.displayName,
                username: profileQuery.data.username,
                avatarUrl: profileQuery.data.avatarUrl
              }}
              size="lg"
              className="shadow-sm"
            />
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-medium text-secondary/80 transition group-hover:text-primary sm:text-xl">
                Compartilhe uma intenção…
              </span>
              <span className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-primary/15 pt-3">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-primary/70">
                  <span aria-hidden>🙏</span>
                  <span>Pedido de oração</span>
                </span>
                <span className="pv-compose-cta inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-5 py-2 text-sm font-bold text-onPrimary">
                  <span aria-hidden>✍️</span>
                  <span>Postar pedido</span>
                </span>
              </span>
            </span>
          </button>
        )}

        <div className="divide-y divide-primary/20">
          {showSkeleton && <FeedSkeleton count={4} />}

          {isUnauthorized && activeTab.requiresAuth && (
            <div className="py-6 text-sm text-secondary">
              Você precisa entrar para visualizar o feed de {activeTab.label.toLowerCase()}.
            </div>
          )}

          {!query.isLoading && !isUnauthorized && items.length === 0 && (
            <div className="py-10 text-center">
              <p className="text-3xl" aria-hidden>🕊️</p>
              <p className="mt-2 text-sm font-semibold text-secondary">Ainda não há pedidos neste feed.</p>
              <p className="pv-muted mt-1 text-xs">Seja o primeiro a compartilhar uma intenção.</p>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="mt-4 inline-flex items-center rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-onPrimary"
              >
                Criar pedido
              </button>
            </div>
          )}

          {items.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              viewerId={profileQuery.data?.id}
              prayerActions={prayerActions}
              onPray={handlePray}
              isPrayPending={prayMutation.isPending}
              lastPrayerHit={lastPrayerHit}
              groupNameById={groupNameById}
              categoryLabel={categoryLabel}
              formatDate={formatPostDate}
            />
          ))}
        </div>

        {!isUnauthorized && !query.isLoading && items.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-primary/20 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-primary">Página {page} de {totalPages}</p>
            <div className="overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex min-w-max items-center gap-1.5">
                <button
                  className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page <= 1 || query.isFetching}
                  onClick={() => goToPage(page - 1)}
                  type="button"
                >
                  ← Anterior
                </button>
                {pageNumbers.map((pageNumber) => (
                  <button
                    key={pageNumber}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition ${pageNumber === page ? 'bg-primary text-onPrimary' : 'border border-primary/40 text-primary hover:bg-primary/10'}`}
                    disabled={query.isFetching}
                    onClick={() => goToPage(pageNumber)}
                    type="button"
                  >
                    {pageNumber}
                  </button>
                ))}
                <button
                  className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary transition hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={page >= totalPages || query.isFetching}
                  onClick={() => goToPage(page + 1)}
                  type="button"
                >
                  Próxima →
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      <NewRequestModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        onCreated={(visibility) => {
          if (visibility === 'PUBLIC') {
            setSearchParams({ scope: 'public', page: '1' })
          } else {
            setSearchParams({ scope: 'home', page: '1' })
          }
        }}
      />
    </PageShell>
  )
}
