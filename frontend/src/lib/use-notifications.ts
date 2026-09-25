import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/api-error'

export type NotificationSummary = {
  count: number
  friendRequests: number
}

export type FriendRequest = {
  id: string
  fromUserId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  requestedAt: string
}

// Contadores do shell (sino e "Amigos"). Uma chave só para o app inteiro: o
// sino, a tabbar, a sidebar e o mural leem o mesmo cache e o polling não duplica.
export function useNotificationSummary() {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await api.get<NotificationSummary>('/notifications/unread-count')).data
  })
}

export function useFriendRequests(enabled = true) {
  return useQuery({
    queryKey: ['friend-requests'],
    enabled,
    queryFn: async () => (await api.get<{ items: FriendRequest[] }>('/friends/requests')).data.items ?? []
  })
}

// Aceitar/recusar num lugar só, para que painel, página de notificações, mural
// e /friends atualizem os mesmos caches. O backend já marca a notificação do
// pedido como lida, então invalidar ['notifications'] apaga o badge.
export function useFriendRequestActions() {
  const { t } = useTranslation()
  const toast = useToast()
  const confirm = useConfirm()
  const queryClient = useQueryClient()

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['friend-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications'] }),
      queryClient.invalidateQueries({ queryKey: ['friends'] }),
      queryClient.invalidateQueries({ queryKey: ['friend-suggestions'] })
    ])
  }

  const accept = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/accept`)
    },
    onSuccess: async () => {
      toast.success(t('pubProfile.friendAccepted'))
      await refresh()
    },
    onError: async (err) => {
      toast.error(errorMessage(err))
      // 404 aqui costuma ser pedido já resolvido em outra aba: sincroniza.
      await refresh()
    }
  })

  const reject = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/friends/requests/${requestId}/reject`)
    },
    onSuccess: async () => {
      toast.info(t('pubProfile.requestRejected'))
      await refresh()
    },
    onError: async (err) => {
      toast.error(errorMessage(err))
      await refresh()
    }
  })

  async function confirmReject(request: { id: string; username: string }) {
    const ok = await confirm({
      title: t('pubProfile.rejectTitle'),
      description: t('pubProfile.rejectDesc', { username: request.username }),
      confirmLabel: t('group.reject'),
      destructive: true
    })
    if (ok) reject.mutate(request.id)
  }

  return {
    accept: (requestId: string) => accept.mutate(requestId),
    confirmReject,
    pending: accept.isPending || reject.isPending
  }
}
