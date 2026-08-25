import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { Glyph } from '@/components/glyph'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/api-error'
import { prayerActionsFor, traditionLabel, type Tradition } from '@/lib/traditions'
import { categoryEmoji, categoryLabel, prayerCategoryOptions } from '@/lib/categories'

type FriendshipState = 'SELF' | 'FRIEND' | 'PENDING_OUT' | 'PENDING_IN' | 'NONE' | 'BLOCKED_BY_ME' | 'BLOCKED_BY_THEM'

type PublicProfile = {
  user: {
    id: string
    username: string
    displayName: string
    avatarUrl?: string | null
    bio?: string | null
    tradition: Tradition
  }
  friendshipStatus: FriendshipState
  incomingFriendRequestId?: string | null
  outgoingFriendRequestId?: string | null
  stats?: {
    requestsCreated: number
    prayerActionsTotal: number
    prayerActionsReceived: number
    streakDays: number
    prayerActionsByType: Record<string, number>
    prayerActionsByCategory: Record<string, number>
  } | null
}

export function PublicProfilePage() {
  const { t } = useTranslation()
  const { username = '' } = useParams<{ username: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const profileKey = ['profile', 'public', username.toLowerCase()]

  const profileQuery = useQuery({
    queryKey: profileKey,
    enabled: username.length > 0,
    queryFn: async () => {
      const res = await api.get<PublicProfile>(`/users/${username}`)
      return res.data
    },
    retry: false
  })

  async function invalidateFriendsAreas() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profileKey }),
      queryClient.invalidateQueries({ queryKey: ['friends'] }),
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] })
    ])
  }

  const sendFriendRequest = useMutation({
    mutationFn: async () => {
      await api.post('/friends/requests', { targetUsername: username })
    },
    onSuccess: async () => {
      toast.success(t('pubProfile.requestSent'))
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const acceptFriendRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/accept`)
    },
    onSuccess: async () => {
      toast.success(t('pubProfile.friendAccepted'))
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const cancelFriendRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.delete(`/friends/requests/${requestId}`)
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.requestCanceled'))
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const rejectFriendRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/reject`)
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.requestRejected'))
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const removeFriend = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/friends/${userId}`)
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.friendRemoved'))
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const blockUser = useMutation({
    mutationFn: async () => {
      await api.post('/blocks', { targetUsername: username })
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.userBlocked'))
      await Promise.all([
        invalidateFriendsAreas(),
        queryClient.invalidateQueries({ queryKey: ['blocks'] })
      ])
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const unblockUser = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/blocks/${userId}`)
    },
    onSuccess: async () => {
      toast.success(t('profile.userUnblocked'))
      await Promise.all([
        invalidateFriendsAreas(),
        queryClient.invalidateQueries({ queryKey: ['blocks'] })
      ])
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const status = profileQuery.data?.friendshipStatus
  const owner = profileQuery.data?.user
  const stats = profileQuery.data?.stats
  const prayerActions = useMemo(
    () => (owner ? prayerActionsFor(owner.tradition) : []),
    [owner]
  )

  if (profileQuery.isLoading) {
    return (
      <PageShell>
        <main className="profile">
          <div className="profile__cover" />
          <div className="profile__head">
            <span className="pv-shimmer h-20 w-20 shrink-0 rounded-full" />
            <div className="profile__idblock">
              <span className="pv-shimmer mb-2 block h-8 w-56 rounded" />
              <span className="pv-shimmer block h-4 w-32 rounded" />
            </div>
          </div>
          <section className="profile__stats">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="stat">
                <span className="pv-shimmer block h-7 w-12 rounded" />
                <span className="pv-shimmer mt-2 block h-3 w-20 rounded" />
              </div>
            ))}
          </section>
        </main>
      </PageShell>
    )
  }

  if (profileQuery.isError || !owner) {
    return (
      <PageShell>
        <main className="profile">
          <section className="pcard" style={{ marginTop: 40, textAlign: 'center' }}>
            <h1 className="pcard__title">{t('pubProfile.notFoundTitle')}</h1>
            <p className="pcard__sub" style={{ margin: '0 auto' }}>{t('pubProfile.notFoundSub')}</p>
            <div className="pcard__body">
              <button type="button" className="btn btn--primary" onClick={() => navigate('/feed')}>
                {t('pubProfile.backToFeed')}
              </button>
            </div>
          </section>
        </main>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <main className="profile">
        <div className="profile__cover" />
        <div className="profile__head">
          <Avatar user={owner} size="xl" />
          <div className="profile__idblock">
            <h1 className="profile__name">{owner.displayName}</h1>
            <div className="profile__meta">
              <span>@{owner.username}</span>
            </div>
            {owner.bio && <p className="profile__bio">"{owner.bio}"</p>}
            <div className="profile__chips">
              <span className="profile__chip">
                <span aria-hidden>{owner.tradition === 'EVANGELICAL' ? '🕊️' : '📿'}</span>
                {traditionLabel(owner.tradition)}
              </span>
            </div>
          </div>
          <div className="profile__actions">
          <ProfileActionButton
            status={status}
            displayName={owner.displayName}
            ownerId={owner.id}
            incomingId={profileQuery.data?.incomingFriendRequestId ?? null}
            outgoingId={profileQuery.data?.outgoingFriendRequestId ?? null}
            onSendFriendRequest={() => sendFriendRequest.mutate()}
            onAcceptFriendRequest={(id) => acceptFriendRequest.mutate(id)}
            onRejectFriendRequest={async (id) => {
              const ok = await confirm({
                title: t('pubProfile.rejectTitle'),
                description: t('pubProfile.rejectDesc', { username }),
                confirmLabel: t('group.reject'),
                destructive: true
              })
              if (ok) rejectFriendRequest.mutate(id)
            }}
            onCancelFriendRequest={async (id) => {
              const ok = await confirm({
                title: t('pubProfile.cancelTitle'),
                description: t('pubProfile.cancelDesc', { username }),
                confirmLabel: t('pubProfile.cancelRequest'),
                cancelLabel: t('common.back'),
                destructive: true
              })
              if (ok) cancelFriendRequest.mutate(id)
            }}
            onRemoveFriend={async (id) => {
              const ok = await confirm({
                title: t('pubProfile.removeFriendTitle'),
                description: t('pubProfile.removeFriendDesc', { name: owner.displayName }),
                confirmLabel: t('pubProfile.undo'),
                destructive: true
              })
              if (ok) removeFriend.mutate(id)
            }}
            onBlock={async () => {
              const ok = await confirm({
                title: t('pubProfile.blockTitle'),
                description: t('pubProfile.blockDesc', { name: owner.displayName }),
                confirmLabel: t('pubProfile.block'),
                destructive: true
              })
              if (ok) blockUser.mutate()
            }}
            onUnblock={async () => {
              const ok = await confirm({
                title: t('profile.unblockUser'),
                description: t('pubProfile.unblockDesc', { name: owner.displayName }),
                confirmLabel: t('profile.unblock')
              })
              if (ok) unblockUser.mutate(owner.id)
            }}
            sendBusy={sendFriendRequest.isPending}
            acceptBusy={acceptFriendRequest.isPending}
            rejectBusy={rejectFriendRequest.isPending}
            cancelBusy={cancelFriendRequest.isPending}
            removeBusy={removeFriend.isPending}
            blockBusy={blockUser.isPending}
            unblockBusy={unblockUser.isPending}
          />
          </div>
        </div>

      <section className="profile__stats">
        <div className="stat">
          <div className="stat__num">{stats?.prayerActionsTotal ?? '—'}</div>
          <div className="stat__label">{t('profile.statSent')}</div>
        </div>
        <div className="stat">
          <div className="stat__num">{stats?.prayerActionsReceived ?? '—'}</div>
          <div className="stat__label">{t('profile.statReceived')}</div>
        </div>
        <div className="stat">
          <div className="stat__num">{stats?.requestsCreated ?? '—'}</div>
          <div className="stat__label">{t('profile.statShared')}</div>
        </div>
        <div className="stat">
          <div className="stat__num">{stats?.streakDays ?? '—'}</div>
          <div className="stat__label">{t('profile.statStreak')}</div>
        </div>
      </section>

      {stats ? (
        <section className="pcard">
          <p className="pcard__eyebrow">{t('pubProfile.activityTitle')}</p>
          <h2 className="pcard__title">{t('pubProfile.byPrayerType')}</h2>
          <p className="pcard__sub">
            {status === 'SELF' ? t('pubProfile.activitySelf') : t('pubProfile.activityFriends')}
          </p>

          <div className="pcard__body bd">
            {(() => {
              const rows = prayerActions
                .map((action) => ({ action, count: stats.prayerActionsByType[action.type] ?? 0 }))
                .filter((row) => row.count > 0)
              if (rows.length === 0) {
                return <p className="private__hint" style={{ margin: 0 }}>{t('pubProfile.noPrayersLogged')}</p>
              }
              // A barra é relativa à ação mais frequente: o que interessa aqui é
              // a proporção entre elas, não o valor absoluto.
              const max = Math.max(...rows.map((row) => row.count))
              return rows.map(({ action, count }) => (
                <div key={action.type} className="bd-row">
                  <span className="bd-row__label">
                    <Glyph kind={action.glyph} size={12} color={action.dot} />
                    <span>{action.label}</span>
                  </span>
                  <span className="bd-row__count">{count}</span>
                  <span className="bd-row__track">
                    <span
                      className="bd-row__fill"
                      style={{ width: `${(count / max) * 100}%`, background: action.dot }}
                    />
                  </span>
                </div>
              ))
            })()}
          </div>
        </section>
      ) : status !== 'SELF' && (
        <section className="pcard">
          <h2 className="pcard__title">🔒 {t('pubProfile.statsLocked')}</h2>
          <p className="pcard__sub">{t('pubProfile.statsLockedSub', { name: owner.displayName })}</p>
        </section>
      )}

      {stats && (
        <section className="pcard">
          <h2 className="pcard__title">{t('pubProfile.byCategory')}</h2>

          <div className="pcard__body bd">
            {(() => {
              const known = prayerCategoryOptions().map((option) => ({
                key: option.value as string,
                emoji: option.emoji,
                label: option.label,
                count: stats.prayerActionsByCategory[option.value] ?? 0
              }))
              const knownKeys = new Set(known.map((row) => row.key))
              // Defensivo: categoria que o backend conheça e o front ainda não.
              const unknown = Object.entries(stats.prayerActionsByCategory)
                .filter(([key]) => !knownKeys.has(key))
                .map(([key, count]) => ({ key, emoji: categoryEmoji(key), label: categoryLabel(key), count }))
              const rows = [...known, ...unknown].filter((row) => row.count > 0)
              if (rows.length === 0) {
                return <p className="private__hint" style={{ margin: 0 }}>{t('pubProfile.noCategories')}</p>
              }
              const max = Math.max(...rows.map((row) => row.count))
              return rows.map((row) => (
                <div key={row.key} className="bd-row">
                  <span className="bd-row__label">
                    <span aria-hidden>{row.emoji}</span>
                    <span>{row.label}</span>
                  </span>
                  <span className="bd-row__count">{row.count}</span>
                  <span className="bd-row__track">
                    <span
                      className="bd-row__fill"
                      style={{ width: `${(row.count / max) * 100}%`, background: 'var(--ink-3)' }}
                    />
                  </span>
                </div>
              ))
            })()}
          </div>
        </section>
      )}

      </main>
    </PageShell>
  )
}

type ProfileActionButtonProps = {
  status: FriendshipState | undefined
  displayName: string
  ownerId: string
  incomingId: string | null
  outgoingId: string | null
  onSendFriendRequest: () => void
  onAcceptFriendRequest: (id: string) => void
  onRejectFriendRequest: (id: string) => void
  onCancelFriendRequest: (id: string) => void
  onRemoveFriend: (id: string) => void
  onBlock: () => void
  onUnblock: () => void
  sendBusy: boolean
  acceptBusy: boolean
  rejectBusy: boolean
  cancelBusy: boolean
  removeBusy: boolean
  blockBusy: boolean
  unblockBusy: boolean
}

function ProfileActionButton({
  status,
  ownerId,
  incomingId,
  outgoingId,
  onSendFriendRequest,
  onAcceptFriendRequest,
  onRejectFriendRequest,
  onCancelFriendRequest,
  onRemoveFriend,
  onBlock,
  onUnblock,
  sendBusy,
  acceptBusy,
  rejectBusy,
  cancelBusy,
  removeBusy,
  blockBusy,
  unblockBusy
}: ProfileActionButtonProps) {
  const { t } = useTranslation()
  if (!status) return null
  if (status === 'SELF') {
    return (
      <Link to="/profile" className="btn btn--ghost-out">
        {t('pubProfile.editProfile')}
      </Link>
    )
  }
  if (status === 'BLOCKED_BY_ME') {
    return (
      <div className="profile__actions-stack">
        <span className="profile__badge profile__badge--warn">{t('pubProfile.youBlocked')}</span>
        <button type="button" className="btn btn--ghost-out" disabled={unblockBusy} onClick={onUnblock}>
          {unblockBusy ? t('pubProfile.unblocking') : t('profile.unblock')}
        </button>
      </div>
    )
  }
  if (status === 'BLOCKED_BY_THEM') {
    return <span className="profile__badge profile__badge--warn">{t('pubProfile.unavailable')}</span>
  }
  if (status === 'FRIEND') {
    return (
      <div className="profile__actions-stack">
        <span className="profile__badge">✓ {t('pubProfile.friends')}</span>
        <button type="button" className="btn btn--ghost-out" disabled={removeBusy} onClick={() => onRemoveFriend(ownerId)}>
          {removeBusy ? t('pubProfile.removing') : t('pubProfile.removeFriend')}
        </button>
        <button type="button" className="btn btn--ghost" disabled={blockBusy} onClick={onBlock}>
          {blockBusy ? t('pubProfile.blocking') : t('pubProfile.block')}
        </button>
      </div>
    )
  }
  if (status === 'PENDING_OUT') {
    return (
      <div className="profile__actions-stack">
        <span className="profile__badge">{t('pubProfile.requestSentLabel')}</span>
        {outgoingId && (
          <button type="button" className="btn btn--ghost-out" disabled={cancelBusy} onClick={() => onCancelFriendRequest(outgoingId)}>
            {cancelBusy ? t('pubProfile.canceling') : t('pubProfile.cancelRequest')}
          </button>
        )}
      </div>
    )
  }
  if (status === 'PENDING_IN' && incomingId) {
    return (
      <div className="profile__actions-stack">
        <button type="button" className="btn btn--primary" disabled={acceptBusy} onClick={() => onAcceptFriendRequest(incomingId)}>
          {acceptBusy ? t('pubProfile.accepting') : t('pubProfile.accept')}
        </button>
        <button type="button" className="btn btn--ghost-out" disabled={rejectBusy} onClick={() => onRejectFriendRequest(incomingId)}>
          {rejectBusy ? t('pubProfile.rejecting') : t('group.reject')}
        </button>
      </div>
    )
  }
  return (
    <div className="profile__actions-stack">
      <button type="button" className="btn btn--primary" disabled={sendBusy} onClick={onSendFriendRequest}>
        {sendBusy ? t('pubProfile.sending') : t('pubProfile.addFriend')}
      </button>
      <button type="button" className="btn btn--ghost" disabled={blockBusy} onClick={onBlock}>
        {blockBusy ? t('pubProfile.blocking') : t('pubProfile.block')}
      </button>
    </div>
  )
}
