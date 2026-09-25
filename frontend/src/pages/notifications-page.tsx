import { useMemo, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { Glyph } from '@/components/glyph'
import { prayerActionByType } from '@/lib/traditions'
import { api } from '@/lib/api'
import {
  BUCKET_ORDER,
  bucketLabel,
  bucketOf,
  copyFor,
  relativeTime,
  targetPath,
  type Bucket,
  type ListResponse,
  type Notification
} from '@/lib/notifications'
import { m } from 'motion/react'
import { baseTransition, stagger } from '@/lib/motion'

export function NotificationsPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const listQuery = useQuery({
    queryKey: ['notifications', 'list', 'page'],
    queryFn: async () => {
      const res = await api.get<ListResponse>('/notifications', { params: { limit: 100 } })
      return res.data.items ?? []
    }
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/notifications/${id}/read`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all')
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] })
    }
  })

  const groups = useMemo(() => {
    const items = listQuery.data ?? []
    const buckets: Record<Bucket, Notification[]> = { prayed: [], updates: [], follow: [], group: [], milestone: [], other: [] }
    items.forEach((n) => buckets[bucketOf(n.type)].push(n))
    return BUCKET_ORDER
      .map((b) => ({ key: b, label: bucketLabel(b), items: buckets[b] }))
      .filter((g) => g.items.length > 0)
  }, [listQuery.data])

  const hasItems = (listQuery.data ?? []).length > 0
  const unread = (listQuery.data ?? []).filter((n) => !n.readAt).length

  function onClick(n: Notification) {
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
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              style={{
                marginTop: 14,
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--ink-3)',
                background: 'none',
                border: 0,
                cursor: 'pointer',
                padding: 0
              }}
            >
              {t('notif.markAllRead')}
            </button>
          )}
        </div>

        {listQuery.isLoading && (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('notif.loading')}</p>
        )}

        {!listQuery.isLoading && !hasItems && (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink)', margin: 0 }}>
              {t('notif.emptyTitle')}
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>
              {t('notif.emptySub')}
            </p>
          </div>
        )}

        {groups.map((g, groupIdx) => (
          <section key={g.key} className="notif-group">
            <h2 className="notif-group__h">{g.label}</h2>
            <ul className="notif-list">
              {g.items.map((n, itemIdx) => {
                // Posição corrida na página inteira, para o stagger atravessar
                // os grupos (orações → comunidade → ...) em vez de reiniciar.
                const position =
                  groups.slice(0, groupIdx).reduce((sum, prev) => sum + prev.items.length, 0) + itemIdx
                const unreadFlag = !n.readAt
                const actorUser = n.actor
                  ? {
                      displayName: n.actor.displayName,
                      username: n.actor.username,
                      avatarUrl: n.actor.avatarUrl
                    }
                  : { displayName: '·' }
                // O tipo de oração vem no payload da reação; mostrar qual foi
                // diz mais do que "orou pelo seu pedido".
                const action =
                  n.type === 'PRAYED' || n.type === 'VERSE_SHARE_PRAYED'
                    ? prayerActionByType(n.payload?.actionType)
                    : undefined
                return (
                  <m.li
                    key={n.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0, transition: { ...baseTransition, delay: stagger(position) } }}
                  >
                    <button
                      type="button"
                      onClick={() => onClick(n)}
                      className="notif"
                      style={unreadFlag ? { background: 'var(--card-2)', borderColor: 'var(--line-2)' } : undefined}
                    >
                      <Avatar user={actorUser} size="md" />
                      <div className="notif__body">
                        <div className="notif__line">{copyFor(n)}</div>
                        <div className="notif__meta">
                          {action && (
                            <span
                              className="notif__rx"
                              style={
                                {
                                  '--rx-bg': action.bg,
                                  '--rx-border': action.border,
                                  '--rx-fg': action.fg
                                } as CSSProperties
                              }
                            >
                              <span className="notif__rx-glyph">
                                <Glyph kind={action.glyph} size={11} />
                              </span>
                              {action.label}
                            </span>
                          )}
                          <span className="notif__when">{relativeTime(n.createdAt)}</span>
                        </div>
                      </div>
                    </button>
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
