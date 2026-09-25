import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { PageShell } from '@/components/page-shell'
import { FriendRequestRow } from '@/components/friend-request-row'
import { MotionItem } from '@/components/motion-list'
import { NotificationItem } from '@/components/notification-item'
import { api } from '@/lib/api'
import { baseTransition, stagger } from '@/lib/motion'
import {
  isPendingFriendRequest,
  targetPath,
  type ListResponse,
  type Notification
} from '@/lib/notifications'
import { useFriendRequests } from '@/lib/use-notifications'

type Section = 'new' | 'today' | 'earlier'

const SECTION_ORDER: Section[] = ['new', 'today', 'earlier']

// Cronológico, em três faixas. Antes a página agrupava por tipo com as orações
// primeiro, e um pedido de amizade novo ficava enterrado no fim.
function sectionOf(n: Notification, startOfToday: number): Section {
  if (!n.readAt) return 'new'
  return new Date(n.createdAt).getTime() >= startOfToday ? 'today' : 'earlier'
}

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const listQuery = useQuery({
    queryKey: ['notifications', 'list', 'page'],
    queryFn: async () => (await api.get<ListResponse>('/notifications', { params: { limit: 50 } })).data
  })
  const pendingCount = listQuery.data?.friendRequests ?? 0
  const requestsQuery = useFriendRequests(pendingCount > 0)

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/notifications/${id}/read`)
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all')
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  })

  const sections = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const buckets: Record<Section, Notification[]> = { new: [], today: [], earlier: [] }
    for (const n of listQuery.data?.items ?? []) {
      // Pedido aberto já aparece em cima, com Aceitar/Recusar.
      if (isPendingFriendRequest(n)) continue
      buckets[sectionOf(n, start.getTime())].push(n)
    }
    return SECTION_ORDER.map((key) => ({ key, items: buckets[key] })).filter((sec) => sec.items.length > 0)
  }, [listQuery.data])

  const requests = pendingCount > 0 ? requestsQuery.data ?? [] : []
  const unread = listQuery.data?.unreadCount ?? 0
  const isEmpty = !listQuery.isLoading && sections.length === 0 && requests.length === 0

  function onSelect(n: Notification) {
    if (!n.readAt) markRead.mutate(n.id)
    navigate(targetPath(n))
  }

  return (
    <PageShell>
      <main className="notifs">
        <div className="feed__head">
          <div className="feed__eyebrow">{t('notif.eyebrow')}</div>
          <h1 className="feed__title">{t('nav.notifications')}</h1>
          <p className="feed__sub">{t('notif.sub')}</p>
          {unread > 0 && (
            <button
              type="button"
              className="npanel__action notifs__markall"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              {t('notif.markAllRead')}
            </button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {requests.length > 0 && (
            <m.section
              key="requests"
              className="people__requests"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              aria-labelledby="notifs-requests-h"
            >
              <h2 id="notifs-requests-h" className="canvas__h">
                {t('friends.received')} <span className="canvas__count">{requests.length}</span>
              </h2>
              <div className="req-list">
                <AnimatePresence mode="popLayout">
                  {requests.map((request, index) => (
                    <MotionItem key={request.id} index={index}>
                      <FriendRequestRow request={request} />
                    </MotionItem>
                  ))}
                </AnimatePresence>
              </div>
            </m.section>
          )}
        </AnimatePresence>

        {listQuery.isLoading && (
          <div className="notif-list" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="pv-shimmer h-16 w-full rounded-2xl" />
            ))}
          </div>
        )}

        {isEmpty && (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink)', margin: 0 }}>
              {t('notif.emptyTitle')}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>{t('notif.emptySub')}</p>
          </div>
        )}

        {sections.map((sec, secIdx) => (
          <section key={sec.key} className="notif-group">
            <h2 className="notif-group__h">{t(`notif.section.${sec.key}`)}</h2>
            <ul className="notif-list">
              {sec.items.map((n, itemIdx) => {
                // Posição corrida na página inteira, para o stagger atravessar
                // as faixas em vez de reiniciar.
                const position =
                  sections.slice(0, secIdx).reduce((sum, prev) => sum + prev.items.length, 0) + itemIdx
                return (
                  <m.li
                    key={n.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { ...baseTransition, delay: stagger(position) } }}
                  >
                    <NotificationItem notification={n} onSelect={onSelect} />
                  </m.li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>
    </PageShell>
  )
}
