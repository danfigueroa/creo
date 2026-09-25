import { useEffect, useRef, useState, type PropsWithChildren } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { FriendRequestRow } from '@/components/friend-request-row'
import { NotificationItem } from '@/components/notification-item'
import { api } from '@/lib/api'
import { popIn } from '@/lib/motion'
import { isPendingFriendRequest, targetPath, type ListResponse, type Notification } from '@/lib/notifications'
import { useFriendRequests } from '@/lib/use-notifications'

// Balanço curto do sino. `ring` é um contador: cada incremento remonta o span e
// toca os keyframes uma vez; 0 (estado inicial) não anima.
export function BellSwing({ ring, children }: PropsWithChildren<{ ring: number }>) {
  return (
    <m.span
      key={ring}
      aria-hidden
      style={{ display: 'grid', placeItems: 'center', originY: 0.15 }}
      animate={ring ? { rotate: [0, -14, 11, -7, 3, 0] } : undefined}
      transition={{ duration: 0.6, ease: 'easeInOut' }}
    >
      {children}
    </m.span>
  )
}

// Badge numérico de pendências (sino, "Notificações", "Amigos"). O ponto de
// antes dizia "tem algo", não "quanto" — e um pedido de amizade sumia no meio.
// `initial={false}` no AnimatePresence: numa troca de rota o badge já existente
// aparece parado; só entra com escala quando surge de verdade.
export function CountBadge({ count, className }: { count: number; className: string }) {
  return (
    <AnimatePresence initial={false}>
      {count > 0 && (
        <m.span
          className={`count-badge ${className}`}
          aria-hidden
          initial={{ scale: 0 }}
          animate={{ scale: 1, transition: { type: 'spring', stiffness: 500, damping: 18 } }}
          exit={{ scale: 0, transition: { duration: 0.12 } }}
        >
          {count > 9 ? '9+' : count}
        </m.span>
      )}
    </AnimatePresence>
  )
}

const PANEL_LIMIT = 8
const PANEL_REQUESTS = 3
// Mesmo breakpoint do shell: abaixo dele o painel não cabe e o sino navega.
const MOBILE_QUERY = '(max-width: 900px)'

type Props = {
  unread: number
  friendRequests: number
  ring: number
}

export function NotificationBell({ unread, friendRequests, ring }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // Navegar (item, "ver todas", avatar) fecha o painel.
  useEffect(() => setOpen(false), [location.pathname])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Element
      if (rootRef.current?.contains(target)) return
      // O confirm de "Recusar" abre por cima; clicar nele não é clicar fora.
      if (target.closest?.('[role="dialog"]')) return
      setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function onBellClick() {
    if (window.matchMedia(MOBILE_QUERY).matches) {
      navigate('/notifications')
      return
    }
    setOpen((v) => !v)
  }

  const label = unread ? t('shell.notificationsAriaUnread', { count: unread }) : t('shell.notificationsAria')

  return (
    <div className="nbell" ref={rootRef}>
      <button
        type="button"
        className={`iconbtn${open ? ' is-on' : ''}`}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={onBellClick}
      >
        <BellSwing ring={ring}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
            <path d="M4.5 13V8.5a4.5 4.5 0 0 1 9 0V13l1 1.5h-11L4.5 13Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
            <path d="M7.5 16a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        </BellSwing>
        <CountBadge count={unread} className="iconbtn__badge" />
      </button>

      <AnimatePresence>
        {open && (
          <NotificationPanel
            friendRequests={friendRequests}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function NotificationPanel({ friendRequests, onClose }: { friendRequests: number; onClose: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const listQuery = useQuery({
    queryKey: ['notifications', 'list', 'panel'],
    queryFn: async () =>
      (await api.get<ListResponse>('/notifications', { params: { limit: PANEL_LIMIT + PANEL_REQUESTS } })).data
  })
  const requestsQuery = useFriendRequests(friendRequests > 0)

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

  function onSelect(n: Notification) {
    if (!n.readAt) markRead.mutate(n.id)
    onClose()
    navigate(targetPath(n))
  }

  // Pedidos abertos aparecem na seção de cima, com as ações; repetir na lista
  // daria duas linhas para a mesma coisa.
  const items = (listQuery.data?.items ?? []).filter((n) => !isPendingFriendRequest(n)).slice(0, PANEL_LIMIT)
  const unread = listQuery.data?.unreadCount ?? 0
  const requests = friendRequests > 0 ? requestsQuery.data ?? [] : []
  const shownRequests = requests.slice(0, PANEL_REQUESTS)

  return (
    <m.div
      className="npanel"
      role="dialog"
      aria-label={t('nav.notifications')}
      variants={popIn}
      initial="hidden"
      animate="show"
      exit="exit"
      style={{ originX: 1, originY: 0 }}
    >
      <div className="npanel__head">
        <h2 className="npanel__title">{t('nav.notifications')}</h2>
        {unread > 0 && (
          <button
            type="button"
            className="npanel__action"
            onClick={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
          >
            {t('notif.markAllRead')}
          </button>
        )}
      </div>

      <div className="npanel__scroll">
        {shownRequests.length > 0 && (
          <section className="npanel__section npanel__section--requests" aria-labelledby="npanel-req-h">
            <h3 id="npanel-req-h" className="npanel__h">
              {t('friends.received')} <span className="canvas__count">{requests.length}</span>
            </h3>
            <div className="req-list">
              {shownRequests.map((request) => (
                <FriendRequestRow key={request.id} request={request} />
              ))}
            </div>
            {requests.length > shownRequests.length && (
              <Link to="/friends" className="npanel__more" onClick={onClose}>
                {t('notif.seeAllRequests', { count: requests.length })}
              </Link>
            )}
          </section>
        )}

        {listQuery.isLoading ? (
          <div className="npanel__list" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className="pv-shimmer h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <div className="npanel__list">
            {items.map((n) => (
              <NotificationItem key={n.id} notification={n} onSelect={onSelect} compact />
            ))}
          </div>
        ) : (
          shownRequests.length === 0 && (
            <div className="npanel__empty">
              <p className="npanel__empty-title">{t('notif.emptyTitle')}</p>
              <p className="npanel__empty-sub">{t('notif.emptySub')}</p>
            </div>
          )
        )}
      </div>

      <Link to="/notifications" className="npanel__foot" onClick={onClose}>
        {t('notif.seeAll')}
      </Link>
    </m.div>
  )
}
