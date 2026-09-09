import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'
import { prayerActionsFor, type Tradition } from '@/lib/traditions'
import type { VerseFeedItem } from '@/components/feed-card'

type Profile = { id: string; tradition?: Tradition }

type ActionRecord = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  actionType: string
  createdAt: string
}

/**
 * Detalhe de um versículo compartilhado.
 *
 * Existe também como destino de navegação das notificações VERSE_SHARE_PRAYED —
 * sem ela, essas notificações não teriam para onde levar.
 */
export function VerseSharePage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const confirm = useConfirm()

  const profileQuery = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const res = await api.get<Profile>('/profile')
      return res.data
    }
  })

  const shareQuery = useQuery({
    queryKey: ['verse-share', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<Omit<VerseFeedItem, 'kind'>>(`/verses/shares/${id}`)
      return res.data
    }
  })

  const actionsQuery = useQuery({
    queryKey: ['verse-share', id, 'actions'],
    enabled: Boolean(id),
    queryFn: async () => {
      const res = await api.get<{ items: ActionRecord[] }>(`/verses/shares/${id}/actions`)
      return res.data.items ?? []
    }
  })

  const prayMutation = useMutation({
    mutationFn: async (actionType: string) => {
      await api.post(`/verses/shares/${id}/pray`, { actionType })
    },
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['verse-share', id] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] })
      ])
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/verses/shares/${id}`)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['feed'] })
      navigate('/feed', { replace: true })
    }
  })

  const share = shareQuery.data
  const prayerActions = prayerActionsFor(profileQuery.data?.tradition ?? 'CATHOLIC')
  const isOwner = Boolean(share && profileQuery.data?.id === share.authorId)

  async function handleDelete() {
    const ok = await confirm({
      title: t('verse.deleteTitle'),
      description: t('verse.deleteDesc')
    })
    if (ok) {
      deleteMutation.mutate()
    }
  }

  return (
    <PageShell>
      <main className="detail">
        {shareQuery.isLoading && <span className="pv-shimmer block h-24 w-full rounded" />}
        {shareQuery.isError && <p className="pv-muted">{t('verse.notFound')}</p>}

        {share && (
          <>
            <header className="post__head">
              <Avatar
                user={{
                  displayName: share.authorDisplayName,
                  username: share.authorUsername,
                  avatarUrl: share.authorAvatarUrl
                }}
                size="md"
                linkToProfile={!!share.authorUsername}
              />
              <div className="post__id">
                <div className="post__line">
                  {share.authorUsername ? (
                    <Link to={`/u/${share.authorUsername}`} className="post__name">
                      {share.authorDisplayName || t('card.member')}
                    </Link>
                  ) : (
                    <span className="post__name">{share.authorDisplayName || t('card.member')}</span>
                  )}
                </div>
              </div>
              {isOwner && (
                <button
                  type="button"
                  className="post__edit"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                >
                  {t('card.delete')}
                </button>
              )}
            </header>

            <blockquote className="verse">
              {share.verse.text ? (
                <p className="verse__text">{share.verse.text}</p>
              ) : (
                <p className="verse__text verse__text--missing">{t('verse.textUnavailable')}</p>
              )}
              <cite className="verse__ref">{share.verse.reference}</cite>
            </blockquote>

            {share.comment && <p className="post__text">{share.comment}</p>}

            <div className="post__reactions" style={{ marginTop: 16 }}>
              {prayerActions.map((action) => (
                <button
                  key={action.type}
                  type="button"
                  className={`rx ${(share.prayerTypeCounts?.[action.type] ?? 0) > 0 ? 'rx--on' : ''}`}
                  style={
                    {
                      ['--rx-bg' as any]: action.bg,
                      ['--rx-border' as any]: action.border,
                      ['--rx-fg' as any]: action.fg,
                      ['--rx-dot' as any]: action.dot
                    } as Record<string, string>
                  }
                  disabled={prayMutation.isPending}
                  onClick={() => prayMutation.mutate(action.type)}
                >
                  <span className="rx__emoji" aria-hidden>
                    {action.emoji}
                  </span>
                  <span className="rx__label">{action.label}</span>
                  {(share.prayerTypeCounts?.[action.type] ?? 0) > 0 && (
                    <span className="rx__count">{share.prayerTypeCounts?.[action.type]}</span>
                  )}
                </button>
              ))}
            </div>

            {(actionsQuery.data ?? []).length > 0 && (
              <section style={{ marginTop: 24 }}>
                <div className="side__eyebrow">{t('reqDetail.whoPrayed')}</div>
                <ul className="praylist" style={{ marginTop: 8 }}>
                  {(actionsQuery.data ?? []).map((record) => (
                    <li key={`${record.userId}-${record.actionType}-${record.createdAt}`}>
                      <Avatar user={record} size="xs" />
                      <Link to={`/u/${record.username}`}>{record.displayName || record.username}</Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </PageShell>
  )
}
