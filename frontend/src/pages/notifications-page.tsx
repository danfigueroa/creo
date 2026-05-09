import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { api } from '@/lib/api'

type NotificationType =
  | 'PRAYED'
  | 'FRIEND_REQUEST_RECEIVED'
  | 'FRIEND_REQUEST_ACCEPTED'
  | 'GROUP_JOIN_APPROVED'
  | 'GROUP_JOIN_REQUESTED'
  | 'GROUP_ANNOUNCEMENT_POSTED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_CHANGES_ASKED'

type SubjectType = 'PRAYER_REQUEST' | 'FRIENDSHIP' | 'GROUP'

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

type Bucket = 'prayed' | 'follow' | 'group' | 'other'

const BUCKET_LABELS: Record<Bucket, string> = {
  prayed: 'Orações pelas suas intenções',
  follow: 'Comunidade',
  group: 'Grupos',
  other: 'Outros'
}

function bucketOf(type: NotificationType): Bucket {
  switch (type) {
    case 'PRAYED':
      return 'prayed'
    case 'FRIEND_REQUEST_RECEIVED':
    case 'FRIEND_REQUEST_ACCEPTED':
      return 'follow'
    case 'GROUP_JOIN_APPROVED':
    case 'GROUP_JOIN_REQUESTED':
    case 'GROUP_ANNOUNCEMENT_POSTED':
      return 'group'
    default:
      return 'other'
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const sec = Math.round(ms / 1000)
  if (sec < 60) return 'agora'
  const min = Math.round(sec / 60)
  if (min < 60) return `há ${min} min`
  const hr = Math.round(min / 60)
  if (hr < 24) return `há ${hr} h`
  const day = Math.round(hr / 24)
  if (day < 30) return `há ${day} d`
  return new Date(iso).toLocaleDateString('pt-BR')
}

function targetPath(n: Notification): string {
  switch (n.subjectType) {
    case 'PRAYER_REQUEST':
      return `/requests/${n.subjectId}`
    case 'FRIENDSHIP':
      return '/friends'
    case 'GROUP':
      return `/groups/${n.subjectId}`
    default:
      return '/feed'
  }
}

function copyFor(n: Notification): string {
  const name = n.actor?.displayName || n.actor?.username || 'Alguém'
  switch (n.type) {
    case 'PRAYED':
      return `${name} orou pelo seu pedido`
    case 'FRIEND_REQUEST_RECEIVED':
      return `${name} quer ser seu amigo`
    case 'FRIEND_REQUEST_ACCEPTED':
      return `${name} aceitou seu pedido de amizade`
    case 'GROUP_JOIN_APPROVED':
      return 'Você foi aceito em um grupo'
    case 'GROUP_JOIN_REQUESTED':
      return `${name} pediu para entrar em um grupo que você administra`
    case 'GROUP_ANNOUNCEMENT_POSTED': {
      const title = typeof n.payload?.title === 'string' ? (n.payload.title as string) : ''
      return title ? `${name} publicou: ${title}` : `${name} publicou um anúncio`
    }
    case 'REQUEST_APPROVED':
      return 'Seu pedido foi aprovado pela moderação'
    case 'REQUEST_REJECTED':
      return 'Seu pedido foi rejeitado pela moderação'
    case 'REQUEST_CHANGES_ASKED':
      return 'A moderação pediu ajustes no seu pedido'
    default:
      return 'Nova notificação'
  }
}

export function NotificationsPage() {
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
    const buckets: Record<Bucket, Notification[]> = { prayed: [], follow: [], group: [], other: [] }
    items.forEach((n) => buckets[bucketOf(n.type)].push(n))
    return (Object.keys(BUCKET_LABELS) as Bucket[])
      .map((b) => ({ key: b, label: BUCKET_LABELS[b], items: buckets[b] }))
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
          <div className="feed__eyebrow">Comunidade</div>
          <h1 className="feed__title">Notificações</h1>
          <p className="feed__sub">Quem rezou, quem atualizou, quem se aproximou.</p>
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
              Marcar todas como lidas
            </button>
          )}
        </div>

        {listQuery.isLoading && (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>Carregando notificações…</p>
        )}

        {!listQuery.isLoading && !hasItems && (
          <div style={{ padding: '40px 0', textAlign: 'center' }}>
            <p style={{ fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink)', margin: 0 }}>
              Você está em dia.
            </p>
            <p style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>
              Nada para acompanhar agora — volte quando uma intenção se mover.
            </p>
          </div>
        )}

        {groups.map((g) => (
          <section key={g.key} className="notif-group">
            <h2 className="notif-group__h">{g.label}</h2>
            <ul className="notif-list">
              {g.items.map((n) => {
                const unreadFlag = !n.readAt
                const actorUser = n.actor
                  ? {
                      displayName: n.actor.displayName,
                      username: n.actor.username,
                      avatarUrl: n.actor.avatarUrl
                    }
                  : { displayName: '·' }
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onClick(n)}
                      className="notif"
                      style={unreadFlag ? { background: 'var(--card-2)', borderColor: 'var(--line-2)' } : undefined}
                    >
                      <Avatar user={actorUser} size="md" />
                      <div className="notif__body">
                        <div className="notif__line">{copyFor(n)}</div>
                        <div className="notif__when">{relativeTime(n.createdAt)}</div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </main>
    </PageShell>
  )
}
