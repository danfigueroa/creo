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

  const activeTabIdx = Math.max(
    tabs.findIndex((t) => t.scope === scope),
    0
  )

  return (
    <PageShell>
      <div className="feed">
        <div className="feed__head">
          <div className="feed__eyebrow">Feed social</div>
          <h1 className="feed__title">Intenções e pedidos de oração</h1>
          <p className="feed__sub">
            Um espaço sereno para acompanhar quem reza com você — e por você.
          </p>
        </div>

        <div className="tabs" role="tablist" aria-label="Escopo do feed">
          {tabs.map((tab) => (
            <button
              key={tab.scope}
              role="tab"
              type="button"
              aria-selected={tab.scope === scope}
              className={`tab ${tab.scope === scope ? 'is-on' : ''}`}
              onClick={() => changeScope(tab.scope)}
            >
              {tab.label}
            </button>
          ))}
          <div
            className="tabs__ink"
            style={{ ['--idx' as any]: activeTabIdx } as Record<string, string | number>}
          />
        </div>

        {profileQuery.data?.id && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="composer"
            style={{ width: '100%', textAlign: 'left' }}
          >
            <div className="composer__row">
              <Avatar
                user={{
                  displayName: profileQuery.data.displayName,
                  username: profileQuery.data.username,
                  avatarUrl: profileQuery.data.avatarUrl
                }}
                size="md"
              />
              <div className="composer__field">
                <span className="composer__placeholder">Compartilhe uma intenção…</span>
              </div>
            </div>
            <div className="composer__foot">
              <div className="composer__cats">
                <span className="composer__hint">Pedido de oração</span>
              </div>
              <div className="composer__actions">
                <span className="btn btn--primary">Postar pedido</span>
              </div>
            </div>
          </button>
        )}

        <div className="posts">
          {showSkeleton && <FeedSkeleton count={4} />}

          {isUnauthorized && activeTab.requiresAuth && (
            <div className="py-6 text-sm" style={{ color: 'var(--muted)' }}>
              Você precisa entrar para visualizar o feed de {activeTab.label.toLowerCase()}.
            </div>
          )}

          {!query.isLoading && !isUnauthorized && items.length === 0 && (
            <div className="py-10 text-center">
              <p className="feed__title" style={{ fontSize: 24 }}>
                Ainda não há pedidos neste feed.
              </p>
              <p className="feed__sub mt-2" style={{ margin: '8px auto 0' }}>
                Seja o primeiro a compartilhar uma intenção.
              </p>
              <button
                type="button"
                onClick={() => setComposerOpen(true)}
                className="btn btn--primary"
                style={{ marginTop: 16 }}
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

        {!isUnauthorized && !query.isLoading && items.length > 0 && totalPages > 1 && (
          <div className="pager">
            <button
              type="button"
              className="pager__btn"
              disabled={page <= 1 || query.isFetching}
              onClick={() => goToPage(page - 1)}
            >
              <span aria-hidden>←</span> Anterior
            </button>
            <div className="pager__nums">
              {pageNumbers.map((pageNumber) => (
                <button
                  type="button"
                  key={pageNumber}
                  disabled={query.isFetching}
                  onClick={() => goToPage(pageNumber)}
                  className={`pager__num ${pageNumber === page ? 'is-on' : ''}`}
                >
                  {pageNumber}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="pager__btn"
              disabled={page >= totalPages || query.isFetching}
              onClick={() => goToPage(page + 1)}
            >
              Próxima <span aria-hidden>→</span>
            </button>
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
