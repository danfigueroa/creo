import { FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/page-shell'
import { Input } from '@/components/input'
import { Button } from '@/components/button'
import { Avatar } from '@/components/avatar'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/api-error'

type UserSummary = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
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
      toast.success('Solicitação enviada.')
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
      toast.success('Amizade aceita.')
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
      toast.info('Solicitação recusada.')
      await requestsQuery.refetch()
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  const removeFriend = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/friends/${userId}`)
    },
    onSuccess: async () => {
      toast.info('Amizade desfeita.')
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
      title: 'Recusar solicitação',
      description: `Recusar a solicitação de @${request.username}?`,
      confirmLabel: 'Recusar',
      destructive: true
    })
    if (ok) {
      rejectRequest.mutate(request.id)
    }
  }

  async function handleRemoveFriend(friend: Friend) {
    const ok = await confirm({
      title: 'Desfazer amizade',
      description: `Tem certeza que quer desfazer amizade com @${friend.username}? Vocês deixarão de ver pedidos restritos um do outro.`,
      confirmLabel: 'Desfazer',
      destructive: true
    })
    if (ok) {
      removeFriend.mutate(friend.userId)
    }
  }

  return (
    <PageShell>
      <section className="pv-panel rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Rede de amigos</p>
        <h1 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">Conectar pessoas da comunidade</h1>
        <p className="pv-muted mt-2 text-sm">Busque usuários pelo nome dentro do sistema e envie solicitações de amizade.</p>

        <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={onSearch}>
          <Input onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por @username ou nome" value={query} />
          <Button className="w-full sm:w-auto" type="submit">Buscar</Button>
        </form>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {(searchQuery.data ?? []).map((user) => (
            <article key={user.userId} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel p-4">
              <Avatar user={user} size="md" linkToProfile />
              <div className="min-w-0 flex-1">
                <Link to={`/u/${user.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">
                  {user.displayName}
                </Link>
                <p className="pv-muted mt-1 truncate text-xs">@{user.username}</p>
                <Button className="mt-3 w-full sm:w-auto" disabled={sendRequest.isPending} onClick={() => sendRequest.mutate(user.username)}>
                  Adicionar amigo
                </Button>
              </div>
            </article>
          ))}
          {query.trim().length >= 2 && !searchQuery.isLoading && (searchQuery.data ?? []).length === 0 && (
            <p className="pv-muted rounded-2xl border border-primary bg-panel p-4 text-sm sm:col-span-2">Nenhum usuário encontrado para este nome.</p>
          )}
        </div>
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className="pv-panel rounded-3xl p-6">
          <h2 className="pv-title text-xl font-semibold text-secondary">Solicitações recebidas</h2>
          <div className="mt-4 space-y-3">
            {(requestsQuery.data ?? []).map((request) => (
              <article key={request.id} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel p-4">
                <Avatar user={request} size="md" linkToProfile />
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${request.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">
                    {request.displayName}
                  </Link>
                  <p className="pv-muted mt-1 truncate text-xs">@{request.username}</p>
                  <p className="pv-muted mt-1 text-xs">Recebida em {new Date(request.requestedAt).toLocaleString('pt-BR')}</p>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button disabled={acceptRequest.isPending} onClick={() => acceptRequest.mutate(request.id)}>
                      Aceitar
                    </Button>
                    <Button variant="secondary" disabled={rejectRequest.isPending} onClick={() => handleReject(request)}>
                      Recusar
                    </Button>
                  </div>
                </div>
              </article>
            ))}
            {!requestsQuery.isLoading && (requestsQuery.data ?? []).length === 0 && (
              <p className="pv-muted rounded-2xl border border-primary bg-panel p-4 text-sm">Nenhuma solicitação pendente.</p>
            )}
          </div>
        </section>

        <section className="pv-panel rounded-3xl p-6">
          <h2 className="pv-title text-xl font-semibold text-secondary">Meus amigos</h2>
          <div className="mt-4 space-y-3">
            {(friendsQuery.data ?? []).map((friend) => (
              <article key={friend.userId} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel p-4">
                <Avatar user={friend} size="md" linkToProfile />
                <div className="min-w-0 flex-1">
                  <Link to={`/u/${friend.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">
                    {friend.displayName}
                  </Link>
                  <p className="pv-muted mt-1 truncate text-xs">@{friend.username}</p>
                  <p className="pv-muted mt-1 text-xs">Conectado em {new Date(friend.connectedAt).toLocaleDateString('pt-BR')}</p>
                  <Button
                    variant="secondary"
                    className="mt-3 w-full sm:w-auto"
                    disabled={removeFriend.isPending}
                    onClick={() => handleRemoveFriend(friend)}
                  >
                    Desfazer amizade
                  </Button>
                </div>
              </article>
            ))}
            {!friendsQuery.isLoading && (friendsQuery.data ?? []).length === 0 && (
              <p className="pv-muted rounded-2xl border border-primary bg-panel p-4 text-sm">Você ainda não possui amigos adicionados.</p>
            )}
          </div>
        </section>
      </div>
    </PageShell>
  )
}
