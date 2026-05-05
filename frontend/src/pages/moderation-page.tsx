import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { Button } from '@/components/button'
import { TextArea } from '@/components/text-area'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/api-error'
import { categoryEmoji, categoryLabel } from '@/lib/categories'

type QueueItem = {
  id: string
  groupId: string
  groupName: string
  authorId: string
  authorUsername: string
  authorDisplayName: string
  authorAvatarUrl?: string | null
  title: string
  body: string
  category: string
  visibility: string
  createdAt: string
}

type ModerationAction = 'approve' | 'reject' | 'request-changes'

export function ModerationPage() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, string>>({})

  const queue = useQuery({
    queryKey: ['moderation', 'queue'],
    queryFn: async () => {
      const res = await api.get<{ items: QueueItem[] }>('/moderation/queue')
      return res.data.items
    }
  })

  const action = useMutation({
    mutationFn: async (vars: { requestId: string; action: ModerationAction; reason?: string }) => {
      await api.post(`/moderation/${vars.requestId}/${vars.action}`, { reason: vars.reason ?? '' })
    },
    onSuccess: async (_, vars) => {
      const labels: Record<ModerationAction, string> = {
        approve: 'Pedido aprovado.',
        reject: 'Pedido rejeitado.',
        'request-changes': 'Mudanças solicitadas ao autor.'
      }
      toast.success(labels[vars.action])
      setReasonDrafts((prev) => {
        const next = { ...prev }
        delete next[vars.requestId]
        return next
      })
      await queryClient.invalidateQueries({ queryKey: ['moderation', 'queue'] })
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  async function handleApprove(item: QueueItem) {
    const ok = await confirm({
      title: 'Aprovar pedido',
      description: `Liberar "${item.title}" no grupo ${item.groupName}?`,
      confirmLabel: 'Aprovar'
    })
    if (ok) action.mutate({ requestId: item.id, action: 'approve' })
  }

  function handleReject(item: QueueItem) {
    const reason = reasonDrafts[item.id]?.trim()
    if (!reason) {
      toast.error('Descreva o motivo da rejeição.')
      return
    }
    action.mutate({ requestId: item.id, action: 'reject', reason })
  }

  function handleRequestChanges(item: QueueItem) {
    const reason = reasonDrafts[item.id]?.trim()
    if (!reason) {
      toast.error('Descreva o que precisa ser ajustado.')
      return
    }
    action.mutate({ requestId: item.id, action: 'request-changes', reason })
  }

  return (
    <PageShell>
      <section className="pv-panel rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Governança</p>
        <h1 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">Fila de moderação</h1>
        <p className="pv-muted mt-2 text-sm">
          Pedidos enviados a grupos com moderação obrigatória aparecem aqui. Você só vê itens dos grupos onde é admin ou moderador.
        </p>
      </section>

      <section className="mt-5 space-y-4">
        {queue.isLoading && (
          [0, 1, 2].map((i) => <span key={i} className="pv-shimmer block h-40 rounded-2xl" />)
        )}
        {!queue.isLoading && (queue.data ?? []).length === 0 && (
          <p className="pv-muted rounded-2xl border border-primary bg-panel p-5 text-sm">
            Nada para revisar agora.
          </p>
        )}
        {(queue.data ?? []).map((item) => {
          const draft = reasonDrafts[item.id] ?? ''
          const busy = action.isPending && action.variables?.requestId === item.id
          return (
            <article key={item.id} className="pv-panel rounded-3xl p-5 sm:p-6">
              <header className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <Avatar
                  user={{ username: item.authorUsername, displayName: item.authorDisplayName, avatarUrl: item.authorAvatarUrl ?? null }}
                  size="md"
                  linkToProfile
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/u/${item.authorUsername}`}
                      className="truncate text-sm font-semibold text-secondary hover:text-primary"
                    >
                      {item.authorDisplayName}
                    </Link>
                    <span className="pv-muted text-xs">@{item.authorUsername}</span>
                    <span className="text-xs pv-muted">·</span>
                    <span className="text-xs pv-muted">
                      em <Link to={`/groups/${item.groupId}`} className="text-primary hover:underline">{item.groupName}</Link>
                    </span>
                  </div>
                  <p className="pv-muted mt-1 text-xs">
                    Enviado em {new Date(item.createdAt).toLocaleString('pt-BR')}
                  </p>
                </div>
                <span className="inline-flex items-center gap-1.5 self-start rounded-full border border-primary/40 bg-panel px-2.5 py-1 text-[11px] font-semibold text-primary">
                  <span aria-hidden>{categoryEmoji(item.category)}</span>
                  {categoryLabel(item.category)}
                </span>
              </header>

              <h2 className="pv-title mt-4 text-lg font-bold text-secondary">{item.title}</h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-secondary/90">{item.body}</p>

              <div className="mt-4">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-primary" htmlFor={`reason-${item.id}`}>
                  Motivo (obrigatório para rejeitar ou pedir mudanças)
                </label>
                <TextArea
                  id={`reason-${item.id}`}
                  className="mt-2"
                  rows={2}
                  value={draft}
                  onChange={(e) =>
                    setReasonDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  placeholder="Explique para o autor o que precisa mudar ou por que foi rejeitado."
                />
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                <Button variant="secondary" disabled={busy} onClick={() => handleRequestChanges(item)}>
                  Pedir mudanças
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => handleReject(item)}>
                  Rejeitar
                </Button>
                <Button disabled={busy} onClick={() => handleApprove(item)}>
                  Aprovar
                </Button>
              </div>
            </article>
          )
        })}
      </section>
    </PageShell>
  )
}
