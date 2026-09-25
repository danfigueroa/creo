import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { MotionItem } from '@/components/motion-list'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/api-error'
import i18n from '@/lib/i18n'
import { popIn } from '@/lib/motion'

type Friend = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  bio?: string | null
  connectedAt: string
  mutualFriends: number
  sharedGroups: number
  latestRequest?: {
    id: string
    title: string
    createdAt: string
    prayedCount: number
  }
}

type FriendRequest = {
  id: string
  fromUserId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  requestedAt: string
}

type Suggestion = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  mutualFriends: number
  sharedGroups: number
}

// Abaixo disso a grade inteira cabe na tela e o filtro só ocupa espaço.
const FILTER_MIN_FRIENDS = 6

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

function matches(friend: Friend, term: string): boolean {
  const needle = term.trim().replace(/^@+/, '').toLowerCase()
  if (!needle) return true
  return friend.displayName.toLowerCase().includes(needle) || friend.username.toLowerCase().includes(needle)
}

export function FriendsPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState('')

  const friendsQuery = useQuery({
    queryKey: ['friends'],
    queryFn: async () => (await api.get<{ items: Friend[] }>('/friends')).data.items ?? []
  })

  const requestsQuery = useQuery({
    queryKey: ['friend-requests'],
    queryFn: async () => (await api.get<{ items: FriendRequest[] }>('/friends/requests')).data.items ?? []
  })

  const suggestionsQuery = useQuery({
    queryKey: ['friend-suggestions'],
    queryFn: async () => (await api.get<{ items: Suggestion[] }>('/users/suggested')).data.items ?? []
  })

  // A sidebar ("Em oração agora") lê a mesma lista com outra chave.
  async function refreshFriends() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['friends'] }),
      queryClient.invalidateQueries({ queryKey: ['friend-suggestions'] })
    ])
  }

  const acceptRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/accept`)
    },
    onSuccess: async () => {
      toast.success(t('pubProfile.friendAccepted'))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['notifications'] }),
        refreshFriends()
      ])
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/reject`)
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.requestRejected'))
      await queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const removeFriend = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/friends/${userId}`)
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.friendRemoved'))
      await refreshFriends()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const sendRequest = useMutation({
    mutationFn: async (targetUsername: string) => {
      await api.post('/friends/requests', { targetUsername })
    },
    onSuccess: async () => {
      toast.success(t('pubProfile.requestSent'))
      await queryClient.invalidateQueries({ queryKey: ['friend-suggestions'] })
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  async function handleReject(request: FriendRequest) {
    const ok = await confirm({
      title: t('pubProfile.rejectTitle'),
      description: t('pubProfile.rejectDesc', { username: request.username }),
      confirmLabel: t('group.reject'),
      destructive: true
    })
    if (ok) rejectRequest.mutate(request.id)
  }

  async function handleRemoveFriend(friend: Friend) {
    const ok = await confirm({
      title: t('pubProfile.removeFriendTitle'),
      description: t('friends.removeFriendDesc', { username: friend.username }),
      confirmLabel: t('pubProfile.undo'),
      destructive: true
    })
    if (ok) removeFriend.mutate(friend.userId)
  }

  const friends = friendsQuery.data ?? []
  const requests = requestsQuery.data ?? []
  const suggestions = suggestionsQuery.data ?? []
  const visibleFriends = useMemo(() => friends.filter((f) => matches(f, filter)), [friends, filter])

  return (
    <PageShell>
      <main className="canvas">
        <div className="feed__head">
          <div className="feed__eyebrow">{t('friends.eyebrow')}</div>
          <h1 className="feed__title">{t('friends.title')}</h1>
          <p className="feed__sub">{t('friends.sub')}</p>
        </div>

        <AnimatePresence initial={false}>
          {requests.length > 0 && (
            <m.section
              key="requests"
              className="people__requests"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginBottom: 0 }}
              aria-labelledby="friends-requests-h"
            >
              <h2 id="friends-requests-h" className="canvas__h">
                {t('friends.received')} <span className="canvas__count">{requests.length}</span>
              </h2>
              <div className="req-list">
                <AnimatePresence mode="popLayout">
                  {requests.map((request, index) => (
                    <MotionItem key={request.id} index={index} className="req">
                      <Avatar user={request} size="md" linkToProfile />
                      <div className="req__body">
                        <Link to={`/u/${request.username}`} className="req__name">
                          {request.displayName}
                        </Link>
                        <div className="req__meta">
                          @{request.username} · {relativeTime(request.requestedAt)}
                        </div>
                      </div>
                      <div className="req__actions">
                        <button
                          type="button"
                          className="btn btn--primary btn--sm"
                          disabled={acceptRequest.isPending}
                          onClick={() => acceptRequest.mutate(request.id)}
                        >
                          {t('pubProfile.accept')}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost-out btn--sm"
                          disabled={rejectRequest.isPending}
                          onClick={() => handleReject(request)}
                        >
                          {t('group.reject')}
                        </button>
                      </div>
                    </MotionItem>
                  ))}
                </AnimatePresence>
              </div>
            </m.section>
          )}
        </AnimatePresence>

        <section aria-labelledby="friends-list-h">
          <div className="canvas__bar">
            <h2 id="friends-list-h" className="canvas__h">
              {t('friends.myFriends')}
              {friends.length > 0 && <span className="canvas__count">{friends.length}</span>}
            </h2>
            {friends.length >= FILTER_MIN_FRIENDS && (
              <label className="canvas__filter">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" aria-hidden>
                  <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
                  <line x1="9.2" y1="9.2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
                <input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder={t('friends.filterPlaceholder')}
                  aria-label={t('friends.filterPlaceholder')}
                />
              </label>
            )}
          </div>

          {friendsQuery.isLoading && (
            <div className="friend-grid">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="friend-card">
                  <div className="friend-card__top">
                    <span className="pv-shimmer h-14 w-14 rounded-full" />
                    <div className="flex-1">
                      <span className="pv-shimmer block h-5 w-2/3 rounded" />
                      <span className="pv-shimmer mt-2 block h-3 w-1/3 rounded" />
                    </div>
                  </div>
                  <span className="pv-shimmer block h-3 w-full rounded" />
                  <span className="pv-shimmer block h-3 w-4/5 rounded" />
                </div>
              ))}
            </div>
          )}

          {!friendsQuery.isLoading && friends.length === 0 && (
            <div className="canvas__empty">
              <p className="canvas__empty-title">{t('friends.emptyTitle')}</p>
              <p className="canvas__empty-sub">{t('friends.emptySub')}</p>
            </div>
          )}

          {friends.length > 0 && visibleFriends.length === 0 && (
            <p className="canvas__note">{t('friends.noMatch', { term: filter.trim() })}</p>
          )}

          {visibleFriends.length > 0 && (
            <div className="friend-grid">
              <AnimatePresence mode="popLayout">
                {visibleFriends.map((friend, index) => (
                  <MotionItem key={friend.userId} index={index}>
                    <FriendCard
                      friend={friend}
                      busy={removeFriend.isPending}
                      onRemove={() => handleRemoveFriend(friend)}
                    />
                  </MotionItem>
                ))}
              </AnimatePresence>
            </div>
          )}
        </section>

        {suggestions.length > 0 && (
          <section className="people__suggest" aria-labelledby="friends-suggest-h">
            <h2 id="friends-suggest-h" className="canvas__h">{t('friends.suggestTitle')}</h2>
            <ul className="suggest-row">
              {suggestions.map((s) => (
                <li key={s.userId} className="suggest">
                  <Avatar user={s} size="lg" linkToProfile />
                  <Link to={`/u/${s.username}`} className="suggest__name">
                    {s.displayName}
                  </Link>
                  <span className="suggest__reason">{suggestionReason(s)}</span>
                  <button
                    type="button"
                    className="btn btn--ghost-out btn--sm"
                    disabled={sendRequest.isPending}
                    onClick={() => sendRequest.mutate(s.username)}
                  >
                    {t('friends.addFriend')}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </PageShell>
  )
}

function suggestionReason(s: Suggestion): string {
  if (s.mutualFriends > 0) return i18n.t('friends.mutualFriends', { count: s.mutualFriends })
  if (s.sharedGroups > 0) return i18n.t('friends.sharedGroups', { count: s.sharedGroups })
  return `@${s.username}`
}

function FriendCard({ friend, busy, onRemove }: { friend: Friend; busy: boolean; onRemove: () => void }) {
  const { t } = useTranslation()
  const since = new Date(friend.connectedAt).toLocaleDateString(i18n.language, { month: 'short', year: 'numeric' })
  const latest = friend.latestRequest

  return (
    <article className="friend-card">
      <div className="friend-card__top">
        <Avatar user={friend} size="lg" />
        <div className="friend-card__id">
          {/* O link do nome cobre o card inteiro (::after); a intenção e o menu
              ficam por cima com z-index próprio. */}
          <Link to={`/u/${friend.username}`} className="friend-card__name">
            {friend.displayName}
          </Link>
          <div className="friend-card__handle">@{friend.username}</div>
        </div>
        <FriendMenu busy={busy} onRemove={onRemove} />
      </div>

      {friend.bio && <p className="friend-card__bio">{friend.bio}</p>}

      <ul className="friend-card__meta">
        {friend.mutualFriends > 0 && <li>{t('friends.mutualFriends', { count: friend.mutualFriends })}</li>}
        {friend.sharedGroups > 0 && <li>{t('friends.sharedGroups', { count: friend.sharedGroups })}</li>}
        <li>{t('friends.since', { date: since })}</li>
      </ul>

      {latest && (
        <Link to={`/requests/${latest.id}`} className="friend-card__latest">
          <span className="friend-card__latest-eyebrow">{t('friends.latestIntention')}</span>
          <span className="friend-card__latest-title">{latest.title}</span>
          <span className="friend-card__latest-meta">
            {relativeTime(latest.createdAt)}
            {latest.prayedCount > 0 && <> · {t('friends.prayedCount', { count: latest.prayedCount })}</>}
          </span>
        </Link>
      )}
    </article>
  )
}

function FriendMenu({ busy, onRemove }: { busy: boolean; onRemove: () => void }) {
  const { t } = useTranslation()
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
    <div className="friend-card__more" ref={ref}>
      <button
        type="button"
        className="iconbtn iconbtn--sm"
        aria-label={t('card.moreOptions')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" aria-hidden>
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            className="menu-pop"
            variants={popIn}
            initial="hidden"
            animate="show"
            exit="exit"
            style={{ originX: 1, originY: 0 }}
          >
            <button
              type="button"
              role="menuitem"
              className="menu-pop__item menu-pop__item--danger"
              onClick={() => {
                setOpen(false)
                onRemove()
              }}
            >
              {t('pubProfile.removeFriend')}
            </button>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  )
}
