import { ReactNode, memo, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { PrayerAction } from '@/lib/traditions'
import { Avatar } from '@/components/avatar'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'

// Category palette — tinted oklch pills for each prayer category badge.
const CATEGORY_PALETTE: Record<string, { bg: string; fg: string }> = {
  HEALTH: { bg: 'oklch(0.93 0.03 145)', fg: 'oklch(0.38 0.08 145)' },
  FAMILY: { bg: 'oklch(0.94 0.03 25)', fg: 'oklch(0.42 0.10 25)' },
  WORK: { bg: 'oklch(0.93 0.03 175)', fg: 'oklch(0.38 0.08 190)' },
  GRIEF: { bg: 'oklch(0.93 0.02 250)', fg: 'oklch(0.40 0.06 250)' },
  THANKSGIVING: { bg: 'oklch(0.93 0.04 95)', fg: 'oklch(0.40 0.10 80)' },
  OTHER: { bg: 'oklch(0.93 0.03 220)', fg: 'oklch(0.38 0.08 220)' }
}

function categoryStyle(category: string) {
  const palette = CATEGORY_PALETTE[category] || CATEGORY_PALETTE.OTHER
  return { background: palette.bg, color: palette.fg }
}

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
  allowAnonymous?: boolean
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
  categoryLabel,
  formatDate
}: PrayerCardProps) {
  const isOwner = viewerId === item.authorId
  const fullDate = formatDate(item.createdAt)
  const authorUser = {
    displayName: item.authorDisplayName,
    username: item.authorUsername,
    avatarUrl: item.authorAvatarUrl
  }
  const total = prayerActions.reduce(
    (sum, action) => sum + (item.prayerTypeCounts?.[action.type] ?? 0),
    0
  )

  return (
    <article className="post">
      <header className="post__head">
        <Avatar user={authorUser} size="md" linkToProfile={!!item.authorUsername} />
        <div className="post__id">
          <div className="post__line">
            {item.authorUsername ? (
              <Link to={`/u/${item.authorUsername}`} className="post__name">
                {item.authorDisplayName || 'Membro'}
              </Link>
            ) : (
              <span className="post__name">{item.authorDisplayName || 'Membro'}</span>
            )}
            {item.authorUsername && (
              <>
                <span className="post__handle">@{item.authorUsername}</span>
                <span className="post__sep">·</span>
              </>
            )}
            <time className="post__when" dateTime={item.createdAt} title={fullDate}>
              {relativeTime(item.createdAt)}
            </time>
            {isOwner && item.allowAnonymous && (
              <>
                <span className="post__sep">·</span>
                <span
                  className="post__when"
                  title="Você publicou esta intenção como anônima — outras pessoas veem como Anônimo."
                  style={{ fontStyle: 'italic' }}
                >
                  publicado como anônimo
                </span>
              </>
            )}
          </div>
          <div className="post__line post__line--meta">
            <span className="cat-pill" style={categoryStyle(item.category)}>
              {categoryLabel[item.category] || item.category}
            </span>
          </div>
        </div>
        {total > 0 && (
          <div className="post__total" aria-label={`${total} orações ao todo`}>
            <span className="post__total-num">{total}</span>
            <span className="post__total-label">em oração</span>
          </div>
        )}
        {isOwner && (
          <Link to={`/requests/${item.id}`} className="post__edit" aria-label="Editar pedido">
            Editar
          </Link>
        )}
      </header>

      <Link to={`/requests/${item.id}`} className="block" style={{ textDecoration: 'none', color: 'inherit' }}>
        <h3 className="post__title">{item.title}</h3>
        <p className="post__text">{item.body}</p>
      </Link>

      <footer className="post__foot" onClick={(e) => e.stopPropagation()}>
        <div className="post__reactions">
          {prayerActions.map((action) => (
            <ReactionPill
              key={`${item.id}-${action.type}`}
              action={action}
              count={item.prayerTypeCounts?.[action.type] ?? 0}
              triggered={lastPrayerHit?.requestID === item.id && lastPrayerHit?.actionType === action.type}
              triggerKey={lastPrayerHit?.fxID}
              disabled={isPrayPending}
              onPress={() => onPray(item.id, action.type)}
            />
          ))}
        </div>
      </footer>
    </article>
  )
}

type ReactionPillProps = {
  action: PrayerAction
  count: number
  triggered: boolean
  triggerKey?: number
  disabled: boolean
  onPress: () => void
}

function ReactionPill({ action, count, triggered, triggerKey, disabled, onPress }: ReactionPillProps) {
  const [bursts, setBursts] = useState<number[]>([])
  const [pop, setPop] = useState(false)
  const seenTrigger = useRef<number | undefined>(undefined)

  // External trigger: when an optimistic prayer happens (parent set lastPrayerHit
  // with a fresh fxID for this action), play the burst once for that key.
  useEffect(() => {
    if (!triggered || !triggerKey || seenTrigger.current === triggerKey) return
    seenTrigger.current = triggerKey
    setPop(true)
    const popTimer = window.setTimeout(() => setPop(false), 380)
    setBursts((b) => [...b, triggerKey])
    const burstTimer = window.setTimeout(
      () => setBursts((b) => b.filter((x) => x !== triggerKey)),
      900
    )
    return () => {
      window.clearTimeout(popTimer)
      window.clearTimeout(burstTimer)
    }
  }, [triggered, triggerKey])

  const styleVars = {
    ['--rx-bg' as any]: action.bg,
    ['--rx-border' as any]: action.border,
    ['--rx-fg' as any]: action.fg,
    ['--rx-dot' as any]: action.dot
  } as Record<string, string>

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className={`rx ${count > 0 ? 'rx--on' : ''} ${pop ? 'rx--pop' : ''}`}
      style={styleVars}
      aria-label={`${action.label}${count ? `, ${count}` : ''}`}
    >
      <span className="rx__emoji" aria-hidden>
        {action.emoji}
      </span>
      <span className="rx__label">{action.label}</span>
      {count > 0 && <span className="rx__count">{count}</span>}
      {bursts.map((id) => (
        <span key={id} className="rx__burst" aria-hidden>
          {action.emoji}
        </span>
      ))}
    </button>
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
    <article
      className="pv-announcement-card overflow-hidden"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--r-3)',
        margin: '14px 0'
      }}
    >
      {item.imageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden" style={{ background: 'rgba(14, 74, 83, 0.04)' }}>
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
          <span
            className="cat-pill"
            style={{ background: 'oklch(0.93 0.03 220)', color: 'oklch(0.38 0.08 220)' }}
          >
            Anúncio
          </span>
          {item.groupName && (
            <MaybeLink
              to={groupHref}
              interactive={interactive}
              className="hover:underline"
              {...({ style: { color: 'var(--ink-3)' } } as any)}
            >
              #{item.groupName}
            </MaybeLink>
          )}
        </header>

        <MaybeLink to={groupHref} interactive={interactive} className="block">
          <h3
            style={{
              fontFamily: 'var(--serif)',
              fontWeight: 500,
              fontSize: 22,
              lineHeight: 1.18,
              letterSpacing: '-0.015em',
              color: 'var(--ink)',
              margin: 0
            }}
          >
            {item.title}
          </h3>
        </MaybeLink>

        <EventDateBadge eventAt={item.eventAt} />

        <p
          className="whitespace-pre-line"
          style={{ fontSize: 15, lineHeight: 1.55, color: 'var(--ink-2)', margin: 0 }}
        >
          {item.body}
        </p>

        <div
          className="flex items-center justify-between gap-3 pt-3"
          style={{ borderTop: '1px solid var(--line)' }}
        >
          <MaybeLink to={profileHref} interactive={interactive && !!item.authorUsername} className="flex min-w-0 items-center gap-2.5">
            <Avatar user={authorUser} size="sm" />
            <div className="min-w-0 text-xs leading-tight">
              <span className="block truncate font-semibold" style={{ color: 'var(--ink)' }}>
                {item.authorDisplayName || 'Membro'}
              </span>
              <span className="block truncate" style={{ color: 'var(--muted)' }}>
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
