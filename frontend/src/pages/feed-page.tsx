import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { PageShell } from '@/components/page-shell'
import { api } from '@/lib/api'
import { FeedCard, flattenFeedItem, type FeedCardItem, type FeedSubjectKind } from '@/components/feed-card'
import { FeedSkeleton } from '@/components/feed-skeleton'
import { MotionItem, useSettledKey } from '@/components/motion-list'
import { duration, fade } from '@/lib/motion'
import { Avatar } from '@/components/avatar'
import { useComposerStore } from '@/state/composer-store'
import { DailyVerse } from '@/components/daily-verse'
import { prayerActionsFor, type Tradition } from '@/lib/traditions'
import i18n from '@/lib/i18n'

type FeedScope = 'home' | 'public' | 'groups' | 'friends'
type ProfileMini = { id: string; displayName?: string; username?: string; avatarUrl?: string | null; tradition?: Tradition }
type GroupLite = { id: string; name: string }
type FeedPagination = { page: number; pageSize: number; total: number; totalPages: number }
type RawFeedResponse = { items: Parameters<typeof flattenFeedItem>[0][]; pagination: FeedPagination }
type FeedResponse = { items: FeedCardItem[]; pagination: FeedPagination }

const tabs: Array<{ scope: FeedScope; labelKey: string; endpoint: string; requiresAuth: boolean }> = [
  { scope: 'home', labelKey: 'feed.tabHome', endpoint: '/feed/home', requiresAuth: true },
  { scope: 'groups', labelKey: 'feed.tabGroups', endpoint: '/feed/groups', requiresAuth: true },
  { scope: 'friends', labelKey: 'feed.tabFriends', endpoint: '/feed/friends', requiresAuth: true },
  { scope: 'public', labelKey: 'feed.tabPublic', endpoint: '/feed/public', requiresAuth: false }
]

const feedPageSize = 10

function formatPostDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return new Intl.DateTimeFormat(i18n.language || 'pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

export function FeedPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [lastPrayerHit, setLastPrayerHit] = useState<{ subjectId: string; actionType: string; fxID: number } | null>(null)
  const openComposer = useComposerStore((s) => s.openComposer)
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
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const res = await api.get<ProfileMini>('/profile')
      return res.data
    }
  })
  const prayMutation = useMutation({
    // Pedidos e versículos compartilhados reagem pelo mesmo conjunto de orações,
    // mas cada um tem seu endpoint — o kind escolhe qual.
    mutationFn: async ({
      subjectId,
      actionType,
      kind
    }: {
      subjectId: string
      actionType: string
      kind: FeedSubjectKind
    }) => {
      const path = kind === 'VERSE_SHARE' ? `/verses/shares/${subjectId}/pray` : `/requests/${subjectId}/pray`
      await api.post(path, { actionType })
    },
    onMutate: async ({ subjectId, actionType, kind }) => {
      await queryClient.cancelQueries({ queryKey: ['feed', scope, page] })
      const previous = queryClient.getQueryData<FeedResponse>(['feed', scope, page])
      if (previous) {
        queryClient.setQueryData<FeedResponse>(['feed', scope, page], {
          ...previous,
          items: previous.items.map((it) =>
            it.kind === kind && it.id === subjectId
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
      setLastPrayerHit({ subjectId, actionType, fxID: Date.now() })
      return { previous }
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(['feed', scope, page], ctx.previous)
      }
    },
    onSettled: async () => {
      // Só a página visível: o optimistic já atualizou a UI e as demais
      // páginas/abas em cache revalidam sozinhas pelo staleTime.
      await queryClient.invalidateQueries({ queryKey: ['feed', scope, page] })
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
  // Troca de aba/página faz crossfade da lista inteira; refetch da mesma página
  // não (a chave não muda) — só os itens novos ou removidos se animam.
  const listKey = useSettledKey(`${scope}-${page}`, !!feedData && !query.isPlaceholderData)

  useEffect(() => {
    if (!lastPrayerHit) {
      return
    }
    const timer = window.setTimeout(() => setLastPrayerHit(null), 900)
    return () => window.clearTimeout(timer)
  }, [lastPrayerHit])

  // Prefetch de outra aba só quando o usuário sinaliza intenção (hover/focus),
  // em vez de disparar 3 GETs extras a cada mount/troca de página.
  // Trocar de aba sempre volta pra página 1 (ver changeScope).
  const prefetchScope = useCallback(
    (targetScope: FeedScope) => {
      if (targetScope === scope) {
        return
      }
      const targetTab = tabs.find((tab) => tab.scope === targetScope)
      if (!targetTab || (targetTab.requiresAuth && !profileQuery.data?.id)) {
        return
      }
      queryClient.prefetchQuery({
        queryKey: ['feed', targetScope, 1],
        queryFn: () => fetchFeed(targetScope, 1),
        staleTime: 30_000
      })
    },
    [scope, profileQuery.data?.id, queryClient]
  )

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

  const handleCreated = useCallback(
    (visibility: 'GROUP_ONLY' | 'PRIVATE' | 'PUBLIC') => {
      if (visibility === 'PUBLIC') {
        setSearchParams({ scope: 'public', page: '1' })
      } else {
        setSearchParams({ scope: 'home', page: '1' })
      }
    },
    [setSearchParams]
  )

  const openFeedComposer = useCallback(() => {
    openComposer(undefined, handleCreated)
  }, [openComposer, handleCreated])

  const goToPage = (target: number) => {
    const nextPage = Math.min(Math.max(target, 1), totalPages)
    setSearchParams({ scope, page: String(nextPage) })
  }

  const paginationStart = Math.max(1, page - 2)
  const paginationEnd = Math.min(totalPages, paginationStart + 4)
  const pageNumbers = Array.from({ length: paginationEnd - paginationStart + 1 }, (_, idx) => paginationStart + idx)

  const handlePray = useCallback(
    (subjectId: string, actionType: string, kind: FeedSubjectKind) => {
      prayMutation.mutate({ subjectId, actionType, kind })
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
          <div className="feed__eyebrow">{t('feed.eyebrow')}</div>
          <h1 className="feed__title">{t('feed.title')}</h1>
          <p className="feed__sub">
            {t('feed.sub')}
          </p>
        </div>

        <div className="tabs" role="tablist" aria-label={t('feed.scopeAria')}>
          {tabs.map((tab) => (
            <button
              key={tab.scope}
              role="tab"
              type="button"
              aria-selected={tab.scope === scope}
              className={`tab ${tab.scope === scope ? 'is-on' : ''}`}
              onClick={() => changeScope(tab.scope)}
              onMouseEnter={() => prefetchScope(tab.scope)}
              onFocus={() => prefetchScope(tab.scope)}
            >
              {t(tab.labelKey)}
            </button>
          ))}
          <div
            className="tabs__ink"
            style={{ ['--idx' as any]: activeTabIdx } as Record<string, string | number>}
          />
        </div>

        {/* No mobile a sidebar some, então o versículo do dia entra aqui. */}
        {profileQuery.data?.id && (
          <div className="daily-feed-slot">
            <DailyVerse placement="feed" />
          </div>
        )}

        {profileQuery.data?.id && (
          <button
            type="button"
            onClick={openFeedComposer}
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
                <span className="composer__placeholder">{t('feed.composerPlaceholder')}</span>
              </div>
            </div>
            <div className="composer__foot">
              <div className="composer__cats">
                <span className="composer__hint">{t('feed.composerHint')}</span>
              </div>
              <div className="composer__actions">
                <span className="btn btn--primary">{t('feed.composerPost')}</span>
              </div>
            </div>
          </button>
        )}

        <AnimatePresence mode="wait" initial={false}>
          {showSkeleton ? (
            <m.div key="skeleton" className="posts" variants={fade} initial="hidden" animate="show" exit="exit">
              <FeedSkeleton count={4} />
            </m.div>
          ) : (
            <m.div
              key={listKey}
              className="posts"
              // popLayout tira o card que sai do fluxo com position:absolute,
              // medido contra este container.
              style={{ position: 'relative' }}
              initial={{ opacity: 0 }}
              // Enquanto a próxima aba carrega, a lista atual esmaece — feedback de
              // que o clique pegou, sem trocar o conteúdo por skeleton.
              animate={{ opacity: query.isPlaceholderData ? 0.55 : 1, transition: { duration: duration.base } }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
            >
              {isUnauthorized && activeTab.requiresAuth && (
                <div className="py-6 text-sm" style={{ color: 'var(--muted)' }}>
                  {t('feed.needLogin', { scope: t(activeTab.labelKey).toLowerCase() })}
                </div>
              )}

              {!query.isLoading && !isUnauthorized && items.length === 0 && (
                <div className="py-10 text-center">
                  <p className="feed__title" style={{ fontSize: 24 }}>
                    {t('feed.emptyTitle')}
                  </p>
                  <p className="feed__sub mt-2" style={{ margin: '8px auto 0' }}>
                    {t('feed.emptySub')}
                  </p>
                  <button
                    type="button"
                    onClick={openFeedComposer}
                    className="btn btn--primary"
                    style={{ marginTop: 16 }}
                  >
                    {t('feed.createRequest')}
                  </button>
                </div>
              )}

              <AnimatePresence mode="popLayout">
                {items.map((item, index) => (
                  <MotionItem key={item.id} index={index}>
                    <FeedCard
                      item={item}
                      viewerId={profileQuery.data?.id}
                      prayerActions={prayerActions}
                      onPray={handlePray}
                      isPrayPending={prayMutation.isPending}
                      lastPrayerHit={lastPrayerHit}
                      groupNameById={groupNameById}
                      formatDate={formatPostDate}
                    />
                  </MotionItem>
                ))}
              </AnimatePresence>
            </m.div>
          )}
        </AnimatePresence>

        {!isUnauthorized && !query.isLoading && items.length > 0 && totalPages > 1 && (
          <div className="pager">
            <button
              type="button"
              className="pager__btn"
              disabled={page <= 1 || query.isFetching}
              onClick={() => goToPage(page - 1)}
            >
              <span aria-hidden>←</span> {t('common.previous')}
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
              {t('common.next')} <span aria-hidden>→</span>
            </button>
          </div>
        )}
      </div>
    </PageShell>
  )
}
