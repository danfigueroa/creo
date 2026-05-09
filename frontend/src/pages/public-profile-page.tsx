import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
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
      toast.success('Solicitação enviada.')
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const acceptFriendRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/accept`)
    },
    onSuccess: async () => {
      toast.success('Amizade aceita.')
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const cancelFriendRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.delete(`/friends/requests/${requestId}`)
    },
    onSuccess: async () => {
      toast.info('Solicitação cancelada.')
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const rejectFriendRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/reject`)
    },
    onSuccess: async () => {
      toast.info('Solicitação recusada.')
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const removeFriend = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/friends/${userId}`)
    },
    onSuccess: async () => {
      toast.info('Amizade desfeita.')
      await invalidateFriendsAreas()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const blockUser = useMutation({
    mutationFn: async () => {
      await api.post('/blocks', { targetUsername: username })
    },
    onSuccess: async () => {
      toast.info('Usuário bloqueado.')
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
      toast.success('Usuário desbloqueado.')
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
        <section className="pv-panel rounded-3xl p-6 sm:p-7">
          <div className="flex items-center gap-4">
            <span className="pv-shimmer h-20 w-20 rounded-full" />
            <div className="flex-1 space-y-2">
              <span className="pv-shimmer block h-5 w-48 rounded" />
              <span className="pv-shimmer block h-4 w-32 rounded" />
            </div>
          </div>
          <div className="mt-6 space-y-2">
            <span className="pv-shimmer block h-4 w-full rounded" />
            <span className="pv-shimmer block h-4 w-3/4 rounded" />
          </div>
        </section>
      </PageShell>
    )
  }

  if (profileQuery.isError || !owner) {
    return (
      <PageShell>
        <section className="pv-panel rounded-3xl p-6 text-center sm:p-8">
          <h1 className="pv-title text-xl font-bold text-secondary">Perfil não encontrado</h1>
          <p className="pv-muted mt-2 text-sm">Não encontramos um usuário com esse @username.</p>
          <div className="mt-5 flex justify-center">
            <Button onClick={() => navigate('/feed')}>Voltar ao mural</Button>
          </div>
        </section>
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
              <span className="post__sep">·</span>
              <span>
                <span aria-hidden style={{ marginRight: 4 }}>
                  {owner.tradition === 'EVANGELICAL' ? '🕊️' : '📿'}
                </span>
                {traditionLabel[owner.tradition]}
              </span>
            </div>
            {owner.bio && <p className="profile__bio">"{owner.bio}"</p>}
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
                title: 'Recusar solicitação',
                description: `Recusar solicitação de @${username}?`,
                confirmLabel: 'Recusar',
                destructive: true
              })
              if (ok) rejectFriendRequest.mutate(id)
            }}
            onCancelFriendRequest={async (id) => {
              const ok = await confirm({
                title: 'Cancelar solicitação',
                description: `Cancelar solicitação enviada para @${username}?`,
                confirmLabel: 'Cancelar solicitação',
                cancelLabel: 'Voltar',
                destructive: true
              })
              if (ok) cancelFriendRequest.mutate(id)
            }}
            onRemoveFriend={async (id) => {
              const ok = await confirm({
                title: 'Desfazer amizade',
                description: `Tem certeza que quer desfazer amizade com ${owner.displayName}?`,
                confirmLabel: 'Desfazer',
                destructive: true
              })
              if (ok) removeFriend.mutate(id)
            }}
            onBlock={async () => {
              const ok = await confirm({
                title: 'Bloquear usuário',
                description: `Bloquear ${owner.displayName}? Vocês não verão mais pedidos um do outro e qualquer amizade ou solicitação será desfeita.`,
                confirmLabel: 'Bloquear',
                destructive: true
              })
              if (ok) blockUser.mutate()
            }}
            onUnblock={async () => {
              const ok = await confirm({
                title: 'Desbloquear usuário',
                description: `Desbloquear ${owner.displayName}?`,
                confirmLabel: 'Desbloquear'
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
          <div className="stat__label">orações enviadas</div>
        </div>
        <div className="stat">
          <div className="stat__num">{stats?.prayerActionsReceived ?? '—'}</div>
          <div className="stat__label">orações recebidas</div>
        </div>
        <div className="stat">
          <div className="stat__num">{stats?.requestsCreated ?? '—'}</div>
          <div className="stat__label">intenções compartilhadas</div>
        </div>
        <div className="stat">
          <div className="stat__num">{stats?.streakDays ?? '—'}</div>
          <div className="stat__label">dias consecutivos</div>
        </div>
      </section>

      {stats ? (
        <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
          <h2 className="pv-title text-xl font-bold text-secondary">Atividade de oração</h2>
          <p className="pv-muted mt-1 text-sm">
            {status === 'SELF' ? 'Estes números aparecem para amigos.' : `Visível porque vocês são amigos.`}
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <StatCard label="Pedidos criados" value={stats.requestsCreated} />
            <StatCard label="Orações registradas" value={stats.prayerActionsTotal} />
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Por tipo de oração</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {prayerActions.map((action) => {
                const count = stats.prayerActionsByType[action.type] ?? 0
                if (count === 0) return null
                return (
                  <div key={action.type} className="flex items-center justify-between rounded-2xl border border-primary/40 bg-panel px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm text-secondary">
                      <span aria-hidden>{action.emoji}</span>
                      {action.label}
                    </span>
                    <span className="tabular-nums text-sm font-semibold text-primary">{count}</span>
                  </div>
                )
              })}
            </div>
            {prayerActions.every((a) => (stats.prayerActionsByType[a.type] ?? 0) === 0) && (
              <p className="pv-muted mt-2 text-xs">Sem orações registradas ainda.</p>
            )}
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Por categoria de pedido</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {prayerCategoryOptions.map((option) => {
                const count = stats.prayerActionsByCategory[option.value] ?? 0
                if (count === 0) return null
                return (
                  <div key={option.value} className="flex items-center justify-between rounded-2xl border border-primary/40 bg-panel px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm text-secondary">
                      <span aria-hidden>{option.emoji}</span>
                      {option.label}
                    </span>
                    <span className="tabular-nums text-sm font-semibold text-primary">{count}</span>
                  </div>
                )
              })}
              {Object.keys(stats.prayerActionsByCategory).length === 0 && (
                <p className="pv-muted text-xs sm:col-span-2">Ainda não há categorias contabilizadas.</p>
              )}
            </div>
            {/* Render any unknown category fallback (defensive) */}
            <UnknownCategoriesList byCategory={stats.prayerActionsByCategory} />
          </div>
        </section>
      ) : status !== 'SELF' && (
        <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
          <p className="text-sm text-secondary">
            🔒 Estatísticas de oração ficam visíveis para amigos.
          </p>
          <p className="pv-muted mt-1 text-sm">
            Quando vocês forem amigos, você verá quantos pedidos {owner.displayName} criou e como ela tem orado pela comunidade.
          </p>
        </section>
      )}
      </main>
    </PageShell>
  )
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-primary bg-panel p-5">
      <p className="pv-muted text-xs uppercase tracking-[0.14em]">{label}</p>
      <p className="pv-title mt-1 text-3xl font-bold text-primary">{value}</p>
    </div>
  )
}

function UnknownCategoriesList({ byCategory }: { byCategory: Record<string, number> }) {
  const known = new Set(prayerCategoryOptions.map((o) => o.value))
  const unknown = Object.entries(byCategory).filter(([k]) => !known.has(k as never))
  if (unknown.length === 0) return null
  return (
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      {unknown.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between rounded-2xl border border-primary/40 bg-panel px-3 py-2.5">
          <span className="flex items-center gap-2 text-sm text-secondary">
            <span aria-hidden>{categoryEmoji(k)}</span>
            {categoryLabel(k)}
          </span>
          <span className="tabular-nums text-sm font-semibold text-primary">{v}</span>
        </div>
      ))}
    </div>
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
  if (!status) return null
  if (status === 'SELF') {
    return (
      <Link to="/profile" className="shrink-0">
        <Button type="button" variant="secondary">Editar perfil</Button>
      </Link>
    )
  }
  if (status === 'BLOCKED_BY_ME') {
    return (
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="rounded-full border border-accent/60 bg-panel px-3 py-1.5 text-xs font-semibold text-accent">
          Você bloqueou este usuário
        </span>
        <Button type="button" variant="secondary" disabled={unblockBusy} onClick={onUnblock}>
          {unblockBusy ? 'Desbloqueando…' : 'Desbloquear'}
        </Button>
      </div>
    )
  }
  if (status === 'BLOCKED_BY_THEM') {
    return (
      <span className="shrink-0 rounded-full border border-accent/60 bg-panel px-3 py-1.5 text-xs font-semibold text-accent">
        Indisponível
      </span>
    )
  }
  if (status === 'FRIEND') {
    return (
      <div className="flex shrink-0 flex-col items-end gap-2">
        <span className="rounded-full border border-primary/40 bg-panel px-3 py-1.5 text-xs font-semibold text-primary">
          ✓ Amigos
        </span>
        <Button type="button" variant="secondary" disabled={removeBusy} onClick={() => onRemoveFriend(ownerId)}>
          {removeBusy ? 'Removendo…' : 'Desfazer amizade'}
        </Button>
        <Button type="button" variant="secondary" disabled={blockBusy} onClick={onBlock}>
          {blockBusy ? 'Bloqueando…' : 'Bloquear'}
        </Button>
      </div>
    )
  }
  if (status === 'PENDING_OUT') {
    return (
      <div className="flex shrink-0 flex-col gap-2">
        <Button type="button" variant="secondary" disabled className="cursor-default">Solicitação enviada</Button>
        {outgoingId && (
          <Button type="button" variant="secondary" disabled={cancelBusy} onClick={() => onCancelFriendRequest(outgoingId)}>
            {cancelBusy ? 'Cancelando…' : 'Cancelar solicitação'}
          </Button>
        )}
      </div>
    )
  }
  if (status === 'PENDING_IN' && incomingId) {
    return (
      <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
        <Button type="button" disabled={acceptBusy} onClick={() => onAcceptFriendRequest(incomingId)}>
          {acceptBusy ? 'Aceitando…' : 'Aceitar'}
        </Button>
        <Button type="button" variant="secondary" disabled={rejectBusy} onClick={() => onRejectFriendRequest(incomingId)}>
          {rejectBusy ? 'Recusando…' : 'Recusar'}
        </Button>
      </div>
    )
  }
  return (
    <div className="flex shrink-0 flex-col gap-2">
      <Button type="button" disabled={sendBusy} onClick={onSendFriendRequest}>
        {sendBusy ? 'Enviando…' : 'Adicionar como amigo'}
      </Button>
      <Button type="button" variant="secondary" disabled={blockBusy} onClick={onBlock}>
        {blockBusy ? 'Bloqueando…' : 'Bloquear'}
      </Button>
    </div>
  )
}
