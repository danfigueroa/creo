import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { Avatar } from '@/components/avatar'

type NotificationType =
  | 'PRAYED'
  | 'FRIEND_REQUEST_RECEIVED'
  | 'FRIEND_REQUEST_ACCEPTED'
  | 'GROUP_JOIN_APPROVED'
  | 'GROUP_JOIN_REQUESTED'
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
  unreadCount: number
}

const POLL_INTERVAL_MS = 30_000

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

export function NotificationBell() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const res = await api.get<{ count: number }>('/notifications/unread-count')
      return res.data.count
    }
  })

  const listQuery = useQuery({
    queryKey: ['notifications', 'list'],
    enabled: open,
    queryFn: async () => {
      const res = await api.get<ListResponse>('/notifications', { params: { limit: 20 } })
      return res.data
    }
  })

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await api.post(`/notifications/${id}/read`)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
      ])
    }
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      await api.post('/notifications/read-all')
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] })
      ])
    }
  })

  useEffect(() => {
    if (!open) return
    function onClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const unreadCount = unreadQuery.data ?? 0
  const items = listQuery.data?.items ?? []
  const badge = useMemo(() => {
    if (!unreadCount) return null
    return unreadCount > 99 ? '99+' : String(unreadCount)
  }, [unreadCount])

  function handleItemClick(n: Notification) {
    setOpen(false)
    if (!n.readAt) {
      markRead.mutate(n.id)
    }
    navigate(targetPath(n))
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-label={`Notificações${unreadCount ? ` (${unreadCount} não lidas)` : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        className="pv-chip relative inline-flex h-9 w-9 items-center justify-center rounded-full"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {badge && (
          <span
            aria-hidden
            className="pointer-events-none absolute -right-1 -top-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] font-semibold leading-none tabular-nums tracking-tight text-onPrimary ring-2 ring-[var(--bg)] shadow-[0_2px_4px_-1px_rgba(var(--shadow-rgb),0.4)]"
          >
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] rounded-2xl border border-primary bg-panel shadow-[0_24px_55px_-30px_rgba(var(--shadow-rgb),0.55)]">
          <div className="flex items-center justify-between border-b border-primary/30 px-3 py-2.5">
            <p className="text-sm font-semibold text-secondary">Notificações</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="text-[11px] font-semibold text-primary hover:text-secondary disabled:opacity-50"
              >
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {listQuery.isLoading && (
              <p className="pv-muted px-3 py-6 text-center text-xs">Carregando…</p>
            )}
            {!listQuery.isLoading && items.length === 0 && (
              <p className="pv-muted px-3 py-6 text-center text-xs">Você está em dia. Nada por aqui.</p>
            )}
            {items.map((n) => {
              const unread = !n.readAt
              const actorUser = n.actor
                ? { displayName: n.actor.displayName, username: n.actor.username, avatarUrl: n.actor.avatarUrl }
                : { displayName: '·' }
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleItemClick(n)}
                  className={`flex w-full items-start gap-3 border-b border-primary/15 px-3 py-3 text-left transition last:border-b-0 hover:bg-primary/5 ${unread ? 'bg-primary/5' : ''}`}
                >
                  <Avatar user={actorUser} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-secondary">{copyFor(n)}</p>
                    <p className="pv-muted mt-0.5 text-[11px]">{relativeTime(n.createdAt)}</p>
                  </div>
                  {unread && (
                    <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Não lida" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
