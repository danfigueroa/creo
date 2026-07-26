import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { Avatar } from '@/components/avatar'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/api-error'
import { searchFriendshipLabel, type SearchFriendshipStatus } from '@/lib/friendship'

type UserSummary = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  friendshipStatus?: SearchFriendshipStatus
}

type Friend = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  connectedAt: string
}

type FriendRequest = {
  id: string
  fromUserId: string
  username: string
  displayName: string
  requestedAt: string
}

export function FriendsPage() {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  const friendsQuery = useQuery({
    queryKey: ['friends'],
    queryFn: async () => {
      const res = await api.get<{ items: Friend[] }>('/friends')
      return res.data.items
    }
  })

  const requestsQuery = useQuery({
    queryKey: ['friend-requests'],
    queryFn: async () => {
      const res = await api.get<{ items: FriendRequest[] }>('/friends/requests')
      return res.data.items
    }
  })

  const normalizedQuery = query.trim().replace(/^@+/, '')
  const searchQuery = useQuery({
    queryKey: ['friend-search', normalizedQuery],
    enabled: normalizedQuery.length >= 2,
    queryFn: async () => {
      const res = await api.get<{ items: UserSummary[] }>('/users/search', {
        params: { q: normalizedQuery }
      })
      return res.data.items
    }
  })

  const sendRequest = useMutation({
    mutationFn: async (targetUsername: string) => {
      await api.post('/friends/requests', { targetUsername })
    },
    onSuccess: async () => {
      toast.success(t('pubProfile.requestSent'))
      await searchQuery.refetch()
      await requestsQuery.refetch()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const acceptRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/accept`)
    },
    onSuccess: async () => {
      toast.success(t('pubProfile.friendAccepted'))
      await requestsQuery.refetch()
      await friendsQuery.refetch()
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/reject`)
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.requestRejected'))
      await requestsQuery.refetch()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const removeFriend = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/friends/${userId}`)
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.friendRemoved'))
      await friendsQuery.refetch()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  function onSearch(e: FormEvent) {
    e.preventDefault()
    searchQuery.refetch()
  }

  async function handleReject(request: FriendRequest) {
    const ok = await confirm({
      title: t('pubProfile.rejectTitle'),
      description: t('pubProfile.rejectDesc', { username: request.username }),
      confirmLabel: t('group.reject'),
      destructive: true
    })
    if (ok) {
      rejectRequest.mutate(request.id)
    }
  }

  async function handleRemoveFriend(friend: Friend) {
    const ok = await confirm({
      title: t('pubProfile.removeFriendTitle'),
      description: t('friends.removeFriendDesc', { username: friend.username }),
      confirmLabel: t('pubProfile.undo'),
      destructive: true
    })
    if (ok) {
      removeFriend.mutate(friend.userId)
    }
  }

  return (
    <PageShell>
      <section className="pv-panel rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('friends.eyebrow')}</p>
        <h1 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">{t('friends.title')}</h1>
        <p className="pv-muted mt-2 text-sm">{t('friends.sub')}</p>

        <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={onSearch}>
          <Input onChange={(e) => setQuery(e.target.value)} placeholder={t('friends.searchPlaceholder')} value={query} />
          <Button className="w-full sm:w-auto" type="submit">{t('friends.search')}</Button>
        </form>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(searchQuery.data ?? []).map((user) => {
            const stateLabel = searchFriendshipLabel(user.friendshipStatus)
            return (
              <article key={user.userId} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel p-4">
                <Avatar user={user} size="md" linkToProfile />
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${user.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">
                    {user.displayName}
                  </Link>
                  <p className="pv-muted mt-1 truncate text-xs">@{user.username}</p>
                  {stateLabel ? (
                    <span className="mt-3 inline-block rounded-full border border-primary/40 bg-panel px-3 py-1.5 text-xs font-semibold text-primary">
                      {stateLabel}
                    </span>
                  ) : (
                    <Button className="mt-3 w-full sm:w-auto" disabled={sendRequest.isPending} onClick={() => sendRequest.mutate(user.username)}>
                      {t('friends.addFriend')}
                    </Button>
                  )}
                </div>
              </article>
            )
          })}
          {query.trim().length >= 2 && !searchQuery.isLoading && (searchQuery.data ?? []).length === 0 && (
            <p className="pv-muted rounded-2xl border border-primary bg-panel p-4 text-sm sm:col-span-2">{t('friends.noUsers')}</p>
          )}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="pv-panel rounded-3xl p-6">
          <h2 className="pv-title text-xl font-semibold text-secondary">{t('friends.received')}</h2>
          <div className="mt-4 space-y-3">
            {(requestsQuery.data ?? []).map((request) => (
              <article key={request.id} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel p-4">
                <Avatar user={request} size="md" linkToProfile />
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${request.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">
                    {request.displayName}
                  </Link>
                  <p className="pv-muted mt-1 truncate text-xs">@{request.username}</p>
                  <p className="pv-muted mt-1 text-xs">{t('friends.receivedOn', { date: new Date(request.requestedAt).toLocaleString(i18n.language) })}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button disabled={acceptRequest.isPending} onClick={() => acceptRequest.mutate(request.id)}>
                      {t('pubProfile.accept')}
                    </Button>
                    <Button variant="secondary" disabled={rejectRequest.isPending} onClick={() => handleReject(request)}>
                      {t('group.reject')}
                    </Button>
                  </div>
                </div>
              </article>
            ))}
            {!requestsQuery.isLoading && (requestsQuery.data ?? []).length === 0 && (
              <p className="pv-muted rounded-2xl border border-primary bg-panel p-4 text-sm">{t('group.noRequests')}</p>
            )}
          </div>
        </section>

        <section className="pv-panel rounded-3xl p-6">
          <h2 className="pv-title text-xl font-semibold text-secondary">{t('friends.myFriends')}</h2>
          <div className="mt-4 space-y-3">
            {(friendsQuery.data ?? []).map((friend) => (
              <article key={friend.userId} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel p-4">
                <Avatar user={friend} size="md" linkToProfile />
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${friend.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">
                    {friend.displayName}
                  </Link>
                  <p className="pv-muted mt-1 truncate text-xs">@{friend.username}</p>
                  <p className="pv-muted mt-1 text-xs">{t('friends.connectedOn', { date: new Date(friend.connectedAt).toLocaleDateString(i18n.language) })}</p>
                  <Button
                    variant="secondary"
                    className="mt-3 w-full sm:w-auto"
                    disabled={removeFriend.isPending}
                    onClick={() => handleRemoveFriend(friend)}
                  >
                    {t('pubProfile.removeFriend')}
                  </Button>
                </div>
              </article>
            ))}
            {!friendsQuery.isLoading && (friendsQuery.data ?? []).length === 0 && (
              <p className="pv-muted rounded-2xl border border-primary bg-panel p-4 text-sm">{t('friends.noFriends')}</p>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  )
}
