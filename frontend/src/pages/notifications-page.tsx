import { useMemo, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { Glyph } from '@/components/glyph'
import { prayerActionByType } from '@/lib/traditions'
import { api } from '@/lib/api'
import i18n from '@/lib/i18n'
import { m } from 'motion/react'
import { baseTransition, stagger } from '@/lib/motion'

type NotificationType =
  | 'PRAYED'
  | 'FRIEND_REQUEST_RECEIVED'
  | 'FRIEND_REQUEST_ACCEPTED'
  | 'GROUP_JOIN_APPROVED'
  | 'GROUP_JOIN_REQUESTED'
  | 'GROUP_ANNOUNCEMENT_POSTED'
  | 'REQUEST_UPDATED'
  | 'REQUEST_ANSWERED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_CHANGES_ASKED'
  | 'MILESTONE_PRAYED'
  | 'MILESTONE_CREATED'
  | 'MILESTONE_STREAK'
  | 'VERSE_SHARE_PRAYED'

type SubjectType = 'PRAYER_REQUEST' | 'FRIENDSHIP' | 'GROUP' | 'MILESTONE' | 'VERSE_SHARE'

type Actor = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
}

type Notification = {
  id: string
  type: NotificationType
  subjectType: SubjectType
  subjectId: string
  actor?: Actor | null
  payload: Record<string, unknown>
  readAt?: string | null
  createdAt: string
}

type ListResponse = {
  items: Notification[]
}

type Bucket = 'prayed' | 'updates' | 'follow' | 'group' | 'milestone' | 'other'

const BUCKET_ORDER: Bucket[] = ['prayed', 'updates', 'follow', 'group', 'milestone', 'other']

const bucketLabel = (b: Bucket): string => i18n.t(`notif.bucket.${b}`)

function bucketOf(type: NotificationType): Bucket {
  switch (type) {
    case 'PRAYED':
    case 'VERSE_SHARE_PRAYED':
      return 'prayed'
    case 'REQUEST_UPDATED':
    case 'REQUEST_ANSWERED':
      return 'updates'
    case 'FRIEND_REQUEST_RECEIVED':
    case 'FRIEND_REQUEST_ACCEPTED':
      return 'follow'
    case 'GROUP_JOIN_APPROVED':
    case 'GROUP_JOIN_REQUESTED':
    case 'GROUP_ANNOUNCEMENT_POSTED':
      return 'group'
    case 'MILESTONE_PRAYED':
    case 'MILESTONE_CREATED':
    case 'MILESTONE_STREAK':
      return 'milestone'
    default:
      return 'other'
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const sec = Math.round(ms / 1000)
  if (sec < 60) return i18n.t('time.now')
  const min = Math.round(sec / 60)
  if (min < 60) return i18n.t('time.agoMin', { count: min })
  const hr = Math.round(min / 60)
  if (hr < 24) return i18n.t('time.agoHour', { count: hr })
  const day = Math.round(hr / 24)
  if (day < 30) return i18n.t('notif.agoDay', { count: day })
  return new Date(iso).toLocaleDateString(i18n.language)
}

function targetPath(n: Notification): string {
  switch (n.subjectType) {
    case 'PRAYER_REQUEST':
      return `/requests/${n.subjectId}`
    case 'VERSE_SHARE':
      return `/verses/${n.subjectId}`
    case 'FRIENDSHIP':
      return '/friends'
    case 'GROUP':
      return `/groups/${n.subjectId}`
    case 'MILESTONE':
      return '/profile'
    default:
      return '/feed'
  }
}

function copyFor(n: Notification): string {
  const name = n.actor?.displayName || n.actor?.username || i18n.t('notif.someone')
  switch (n.type) {
    case 'PRAYED':
      return i18n.t('notif.prayed', { name })
    case 'VERSE_SHARE_PRAYED':
      return i18n.t('notif.verseSharePrayed', { name })
    case 'REQUEST_UPDATED':
      return i18n.t('notif.requestUpdated', { name })
    case 'REQUEST_ANSWERED':
      return i18n.t('notif.requestAnswered', { name })
    case 'MILESTONE_PRAYED': {
      const count = typeof n.payload?.count === 'number' ? (n.payload.count as number) : 0
      return count ? i18n.t('notif.milestonePrayed', { count }) : i18n.t('notif.milestonePrayedGeneric')
    }
    case 'MILESTONE_CREATED': {
      const count = typeof n.payload?.count === 'number' ? (n.payload.count as number) : 0
      return count ? i18n.t('notif.milestoneCreated', { count }) : i18n.t('notif.milestoneCreatedGeneric')
    }
    case 'MILESTONE_STREAK': {
      const days = typeof n.payload?.days === 'number' ? (n.payload.days as number) : 0
      return days ? i18n.t('notif.milestoneStreak', { count: days }) : i18n.t('notif.milestoneStreakGeneric')
    }
    case 'FRIEND_REQUEST_RECEIVED':
      return i18n.t('notif.friendRequestReceived', { name })
    case 'FRIEND_REQUEST_ACCEPTED':
      return i18n.t('notif.friendRequestAccepted', { name })
    case 'GROUP_JOIN_APPROVED':
      return i18n.t('notif.groupJoinApproved')
    case 'GROUP_JOIN_REQUESTED':
      return i18n.t('notif.groupJoinRequested', { name })
    case 'GROUP_ANNOUNCEMENT_POSTED': {
      const title = typeof n.payload?.title === 'string' ? (n.payload.title as string) : ''
      return title ? i18n.t('notif.announcementTitle', { name, title }) : i18n.t('notif.announcement', { name })
    }
    case 'REQUEST_APPROVED':
      return i18n.t('notif.requestApproved')
    case 'REQUEST_REJECTED':
      return i18n.t('notif.requestRejected')
    case 'REQUEST_CHANGES_ASKED':
      return i18n.t('notif.requestChangesAsked')
    default:
      return i18n.t('notif.newNotification')
  }
}

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
