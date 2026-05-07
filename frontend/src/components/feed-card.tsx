import { ReactNode, memo, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PrayerAction } from '@/lib/traditions'
import { Avatar } from '@/components/avatar'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'

export type PrayerFeedItem = {
  kind: 'PRAYER_REQUEST'
  id: string
  authorId: string
  authorUsername?: string
  authorDisplayName?: string
  authorAvatarUrl?: string | null
  title: string
  body: string
  category: string
  visibility: 'PUBLIC' | 'GROUP_ONLY' | 'PRIVATE'
  groupIds?: string[]
  groupNames?: string[]
  createdAt: string
  prayedCount: number
  prayerTypeCounts?: Record<string, number>
}

export type AnnouncementFeedItem = {
  kind: 'ANNOUNCEMENT'
  id: string
  groupId: string
  groupName?: string
  authorId: string
  authorUsername?: string
  authorDisplayName?: string
  authorAvatarUrl?: string | null
  title: string
  body: string
  eventAt: string
  imageUrl?: string | null
  createdAt: string
}

export type FeedCardItem = PrayerFeedItem | AnnouncementFeedItem

// flattenFeedItem turns the discriminated wire shape ({kind, prayerRequest|announcement, createdAt})
// into the flat union the FeedCard consumes.
type RawFeedItem =
  | { kind: 'PRAYER_REQUEST'; createdAt: string; prayerRequest: Omit<PrayerFeedItem, 'kind'> }
  | { kind: 'ANNOUNCEMENT'; createdAt: string; announcement: Omit<AnnouncementFeedItem, 'kind'> }

export function flattenFeedItem(raw: RawFeedItem): FeedCardItem {
  if (raw.kind === 'PRAYER_REQUEST') {
    return { kind: 'PRAYER_REQUEST', ...raw.prayerRequest }
  }
  return { kind: 'ANNOUNCEMENT', ...raw.announcement }
}

type PrayerHit = { requestID: string; actionType: string; fxID: number } | null

type FeedCardProps = {
  item: FeedCardItem
  viewerId?: string
  prayerActions: PrayerAction[]
  onPray: (requestID: string, actionType: string) => void
  isPrayPending: boolean
  lastPrayerHit: PrayerHit
  groupNameById: Map<string, string>
  categoryLabel: Record<string, string>
  formatDate: (value: string) => string
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  if (diff < 0) return 'agora'
  const s = Math.floor(diff / 1000)
  if (s < 45) return 'agora'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  const w = Math.floor(d / 7)
  if (w < 5) return `${w}sem`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mês`
  const y = Math.floor(d / 365)
  return `${y}a`
}

function shortMonth(d: Date): string {
  // pt-BR `month: 'short'` returns "mai." — drop the trailing period and uppercase.
  const raw = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(d)
  return raw.replace(/\.$/, '').toUpperCase()
}

function shortWeekday(d: Date): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace(/\.$/, '')
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

// relativeFromNow: human-friendly distance from now to a target date.
// Future: "em 15 min", "em 2 h", "amanhã", "daqui a 3 dias", "em 2 semanas".
// Today: "hoje".
// Past: "ontem", "há 2 dias", "há 3 semanas".
// Very far (>1 ano): empty string (caller hides the line).
function relativeFromNow(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dayDiff = Math.round((startOf(d) - startOf(now)) / 86400000)

  if (dayDiff === 0) {
    const minDiff = Math.round((d.getTime() - now.getTime()) / 60000)
    if (minDiff > 0 && minDiff < 60) return `em ${minDiff} min`
    if (minDiff < 0 && minDiff > -60) return `há ${Math.abs(minDiff)} min`
    const hourDiff = Math.round(minDiff / 60)
    if (hourDiff > 0) return `em ${hourDiff} h`
    if (hourDiff < 0) return `há ${Math.abs(hourDiff)} h`
    return 'hoje'
  }
  if (dayDiff === 1) return 'amanhã'
  if (dayDiff === -1) return 'ontem'
  if (dayDiff > 0) {
    if (dayDiff < 7) return `daqui a ${dayDiff} dias`
    if (dayDiff < 30) {
      const w = Math.round(dayDiff / 7)
      return w === 1 ? 'em 1 semana' : `em ${w} semanas`
    }
    if (dayDiff < 365) {
      const m = Math.round(dayDiff / 30)
      return m === 1 ? 'em 1 mês' : `em ${m} meses`
    }
    return ''
  }
  const past = Math.abs(dayDiff)
  if (past < 7) return `há ${past} dias`
  if (past < 30) {
    const w = Math.round(past / 7)
    return w === 1 ? 'há 1 semana' : `há ${w} semanas`
  }
  if (past < 365) {
    const m = Math.round(past / 30)
    return m === 1 ? 'há 1 mês' : `há ${m} meses`
  }
  return ''
}

export function EventDateBadge({ eventAt }: { eventAt: string }) {
  const d = new Date(eventAt)
  if (Number.isNaN(d.getTime())) return null
  const relative = relativeFromNow(eventAt)
  return (
    <div className="flex items-center gap-3">
      <div className="flex shrink-0 flex-col overflow-hidden rounded-xl border border-primary/30 text-center leading-none">
        <span className="bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-onPrimary">
          {shortMonth(d)}
        </span>
        <span className="px-3 py-1.5 text-2xl font-bold tabular-nums text-secondary">{pad2(d.getDate())}</span>
      </div>
      <div className="text-sm leading-tight">
        <div className="font-semibold text-secondary">
          {shortWeekday(d)}, {pad2(d.getHours())}:{pad2(d.getMinutes())}
        </div>
        {relative && <div className="pv-muted text-xs">{relative}</div>}
      </div>
    </div>
  )
}

function FeedCardComponent(props: FeedCardProps) {
  if (props.item.kind === 'ANNOUNCEMENT') {
    return <AnnouncementCard item={props.item} viewerId={props.viewerId} />
  }
  return <PrayerCard {...props} item={props.item} />
}

type PrayerCardProps = Omit<FeedCardProps, 'item'> & { item: PrayerFeedItem }

function PrayerCard({
  item,
  viewerId,
  prayerActions,
  onPray,
  isPrayPending,
  lastPrayerHit,
  groupNameById,
  categoryLabel,
  formatDate
}: PrayerCardProps) {
  const primaryGroupName =
    item.groupNames?.[0] || (item.groupIds?.[0] ? groupNameById.get(item.groupIds[0]) : undefined)
  const extraGroupsCount = Math.max((item.groupNames?.length ?? 0) - 1, 0)
  const isHit = lastPrayerHit?.requestID === item.id
  const isOwner = viewerId === item.authorId
  const fullDate = formatDate(item.createdAt)
  const authorUser = {
    displayName: item.authorDisplayName,
    username: item.authorUsername,
    avatarUrl: item.authorAvatarUrl
  }

  return (
    <article className={`pv-feed-row group relative flex gap-3 py-4 ${isHit ? 'pv-card-hit' : ''}`}>
      <Avatar user={authorUser} size="md" linkToProfile={!!item.authorUsername} />

      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm">
          {item.authorUsername ? (
            <Link to={`/u/${item.authorUsername}`} className="max-w-[55%] truncate font-semibold text-secondary hover:text-primary">
              {item.authorDisplayName || 'Membro'}
            </Link>
          ) : (
            <span className="max-w-[55%] truncate font-semibold text-secondary">
              {item.authorDisplayName || 'Membro'}
            </span>
          )}
          <span className="truncate text-xs text-primary/80">@{item.authorUsername || 'usuario'}</span>
          <span className="text-xs text-primary/50" aria-hidden>·</span>
          <time className="text-xs text-primary/70" dateTime={item.createdAt} title={fullDate}>
            {relativeTime(item.createdAt)}
          </time>
          <span className="text-xs text-primary/50" aria-hidden>·</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-primary">
            {categoryLabel[item.category] || item.category}
          </span>
          {item.visibility === 'GROUP_ONLY' && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-panel px-2 py-0.5 text-[10px] font-semibold text-primary">
              <span aria-hidden>👥</span>
              <span className="max-w-[10rem] truncate">{primaryGroupName || 'Grupo'}</span>
              {extraGroupsCount > 0 && <span className="text-primary/70">+{extraGroupsCount}</span>}
            </span>
          )}
          {isOwner && (
            <Link
              to={`/requests/${item.id}`}
              className="ml-auto text-[11px] text-primary/70 hover:text-primary"
              aria-label="Editar pedido"
            >
              Editar
            </Link>
          )}
        </div>

        <Link to={`/requests/${item.id}`} className="mt-1 block">
          <h3 className="text-[15px] font-semibold leading-snug text-secondary group-hover:text-primary">
            {item.title}
          </h3>
          <p className="pv-feed-body pv-muted mt-1 text-[15px] leading-relaxed">{item.body}</p>
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {prayerActions.map((action) => {
            const count = item.prayerTypeCounts?.[action.type] ?? 0
            const activeFx = isHit && lastPrayerHit?.actionType === action.type
            return (
              <span
                key={`${item.id}-${action.type}`}
                className={`relative inline-flex ${activeFx ? 'pv-prayer-chip-hit' : ''}`}
              >
                {activeFx && (
                  <span className="pv-prayer-fx" aria-hidden>
                    <span className="pv-prayer-fx-ring" />
                    <span className="pv-prayer-fx-emoji">{action.emoji}</span>
                    <span className="pv-prayer-fx-spark pv-prayer-fx-spark-a" />
                    <span className="pv-prayer-fx-spark pv-prayer-fx-spark-b" />
                    <span className="pv-prayer-fx-spark pv-prayer-fx-spark-c" />
                  </span>
                )}
                <button
                  type="button"
                  disabled={isPrayPending}
                  onClick={() => onPray(item.id, action.type)}
                  aria-label={`${action.label} (${count})`}
                  className="pv-action-btn inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-panel/50 px-2.5 py-1 text-xs font-medium text-muted transition hover:border-primary hover:bg-primary/10 hover:text-primary disabled:opacity-60"
                >
                  <span aria-hidden>{action.emoji}</span>
                  <span>{action.label}</span>
                  {count > 0 && <span className="tabular-nums text-primary">{count}</span>}
                </button>
              </span>
            )
          })}
        </div>
      </div>
    </article>
  )
}

function MaybeLink({
  to,
  interactive,
  className,
  children
}: {
  to: string
  interactive: boolean
  className?: string
  children: ReactNode
}) {
  if (!interactive) return <div className={className}>{children}</div>
  return (
    <Link to={to} className={className}>
      {children}
    </Link>
  )
}

type AnnouncementCardLayoutProps = {
  item: AnnouncementFeedItem
  interactive?: boolean
  manageMenu?: ReactNode
}

// Pure presentational card. Used by AnnouncementCard (live, in feeds) and by the
// announcement form preview. When `interactive` is false, links collapse to <div>
// and the manage menu is hidden.
export function AnnouncementCardLayout({ item, interactive = true, manageMenu }: AnnouncementCardLayoutProps) {
  const authorUser = {
    displayName: item.authorDisplayName,
    username: item.authorUsername,
    avatarUrl: item.authorAvatarUrl
  }
  const groupHref = `/groups/${item.groupId}`
  const profileHref = item.authorUsername ? `/u/${item.authorUsername}` : '#'

  return (
    <article className="pv-announcement-card my-3 overflow-hidden rounded-2xl border border-primary/20 bg-bg shadow-[0_10px_28px_-22px_rgba(var(--shadow-rgb),0.45)]">
      {item.imageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden bg-primary/5">
          <img
            src={item.imageUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <div className="space-y-3 p-5 sm:p-6">
        <header className="flex flex-wrap items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em]">
          <span className="rounded-full bg-primary px-2.5 py-1 text-onPrimary">Anúncio</span>
          {item.groupName && (
            <MaybeLink to={groupHref} interactive={interactive} className="text-primary hover:underline">
              #{item.groupName}
            </MaybeLink>
          )}
        </header>

        <MaybeLink to={groupHref} interactive={interactive} className="block">
          <h3 className="pv-title text-xl font-bold leading-tight text-secondary sm:text-2xl">{item.title}</h3>
        </MaybeLink>

        <EventDateBadge eventAt={item.eventAt} />

        <p className="pv-muted whitespace-pre-line text-[15px] leading-relaxed">{item.body}</p>

        <div className="flex items-center justify-between gap-3 border-t border-primary/15 pt-3">
          <MaybeLink to={profileHref} interactive={interactive && !!item.authorUsername} className="flex min-w-0 items-center gap-2.5">
            <Avatar user={authorUser} size="sm" />
            <div className="min-w-0 text-xs leading-tight">
              <span className="block truncate font-semibold text-secondary">
                {item.authorDisplayName || 'Membro'}
              </span>
              <span className="pv-muted block truncate">
                @{item.authorUsername || 'usuario'} · {relativeTime(item.createdAt)}
              </span>
            </div>
          </MaybeLink>
          {manageMenu}
        </div>
      </div>
    </article>
  )
}

function ManageMenu({
  onEdit,
  onDelete,
  busy
}: {
  onEdit: () => void
  onDelete: () => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Mais opções"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        disabled={busy}
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-primary/70 transition hover:bg-primary/10 hover:text-primary disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-20 mb-1 w-36 overflow-hidden rounded-xl border border-primary/20 bg-panel shadow-[0_18px_44px_-22px_rgba(var(--shadow-rgb),0.6)]"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onEdit()
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-secondary hover:bg-primary/10"
          >
            Editar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onDelete()
            }}
            className="block w-full px-3 py-2 text-left text-xs font-semibold text-primary hover:bg-primary/10"
          >
            Excluir
          </button>
        </div>
      )}
    </div>
  )
}

function AnnouncementCard({ item, viewerId }: { item: AnnouncementFeedItem; viewerId?: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const isAuthor = viewerId === item.authorId

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/groups/${item.groupId}/announcements/${item.id}`)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['group', item.groupId, 'feed'] })
      ])
    }
  })

  async function handleDelete() {
    const ok = await confirm({
      title: 'Excluir anúncio?',
      description: 'Esta ação não pode ser desfeita.',
      confirmLabel: 'Excluir',
      destructive: true
    })
    if (ok) deleteMutation.mutate()
  }

  return (
    <AnnouncementCardLayout
      item={item}
      manageMenu={
        isAuthor ? (
          <ManageMenu
            onEdit={() => navigate(`/groups/${item.groupId}/announcements/${item.id}/edit`)}
            onDelete={handleDelete}
            busy={deleteMutation.isPending}
          />
        ) : undefined
      }
    />
  )
}

export const FeedCard = memo(FeedCardComponent)
