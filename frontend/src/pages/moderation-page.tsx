import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/api-error'
import { categoryLabel } from '@/lib/categories'
import { categoryStyle } from '@/components/feed-card'

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
  const { t, i18n } = useTranslation()
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
        approve: t('mod.approved'),
        reject: t('mod.rejected'),
        'request-changes': t('mod.changesRequested')
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
      title: t('mod.approveTitle'),
      description: t('mod.approveDesc', { title: item.title, group: item.groupName }),
      confirmLabel: t('group.approve')
    })
    if (ok) action.mutate({ requestId: item.id, action: 'approve' })
  }

  function handleReject(item: QueueItem) {
    const reason = reasonDrafts[item.id]?.trim()
    if (!reason) {
      toast.error(t('mod.reasonRejectRequired'))
      return
    }
    action.mutate({ requestId: item.id, action: 'reject', reason })
  }

  function handleRequestChanges(item: QueueItem) {
    const reason = reasonDrafts[item.id]?.trim()
    if (!reason) {
      toast.error(t('mod.reasonChangesRequired'))
      return
    }
    action.mutate({ requestId: item.id, action: 'request-changes', reason })
  }

  return (
    <PageShell>
      <main className="canvas">
        <div className="feed__head">
          <div className="feed__eyebrow">{t('mod.eyebrow')}</div>
          <h1 className="feed__title">{t('mod.title')}</h1>
          <p className="feed__sub">{t('mod.sub')}</p>
        </div>

        <div className="posts">
          {queue.isLoading && [0, 1, 2].map((i) => <span key={i} className="pv-shimmer block h-40 rounded-2xl" />)}
          {!queue.isLoading && (queue.data ?? []).length === 0 && (
            <div className="canvas__empty">
              <p className="canvas__empty-title">{t('mod.empty')}</p>
            </div>
          )}
          {(queue.data ?? []).map((item) => {
            const draft = reasonDrafts[item.id] ?? ''
            const busy = action.isPending && action.variables?.requestId === item.id
            return (
              <article key={item.id} className="post">
                <header className="post__head">
                  <Avatar
                    user={{ username: item.authorUsername, displayName: item.authorDisplayName, avatarUrl: item.authorAvatarUrl ?? null }}
                    size="md"
                    linkToProfile
                  />
                  <div className="post__id">
                    <div className="post__line">
                      <Link to={`/u/${item.authorUsername}`} className="post__name">
                        {item.authorDisplayName}
                      </Link>
                      <span className="post__handle">@{item.authorUsername}</span>
                    </div>
                    <div className="post__line post__line--meta">
                      <span className="post__when">
                        {t('mod.inGroup')}{' '}
                        <Link to={`/groups/${item.groupId}`} style={{ color: 'var(--ink-2)', fontWeight: 500 }}>
                          {item.groupName}
                        </Link>
                      </span>
                      <span className="post__sep">·</span>
                      <span className="post__when">{t('mod.sentOn', { date: new Date(item.createdAt).toLocaleString(i18n.language) })}</span>
                    </div>
                  </div>
                  <span className="cat-pill" style={categoryStyle(item.category)}>
                    {categoryLabel(item.category)}
                  </span>
                </header>

                <h2 className="post__title">{item.title}</h2>
                <p className="post__text">{item.body}</p>

                <div className="field">
                  <label className="field__label" htmlFor={`reason-${item.id}`}>
                    {t('mod.reasonLabel')}
                  </label>
                  <textarea
                    id={`reason-${item.id}`}
                    className="field__control"
                    style={{ minHeight: 72 }}
                    rows={2}
                    value={draft}
                    onChange={(e) => setReasonDrafts((prev) => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder={t('mod.reasonPlaceholder')}
                  />
                </div>

                <div className="form-foot" style={{ marginTop: 16, paddingTop: 14 }}>
                  <div className="form-foot__actions">
                    <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => handleRequestChanges(item)}>
                      {t('mod.requestChanges')}
                    </button>
                    <button type="button" className="btn btn--ghost-out" disabled={busy} onClick={() => handleReject(item)}>
                      {t('mod.reject')}
                    </button>
                    <button type="button" className="btn btn--primary" disabled={busy} onClick={() => handleApprove(item)}>
                      {t('group.approve')}
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      </main>
    </PageShell>
  )
}
