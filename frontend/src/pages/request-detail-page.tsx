import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { Glyph } from '@/components/glyph'
import { useConfirm } from '@/components/confirm-dialog'
import { api } from '@/lib/api'
import i18n from '@/lib/i18n'
import { categoryLabel } from '@/lib/categories'
import { prayerActionsFor, type Tradition, type PrayerAction } from '@/lib/traditions'

type RequestDetail = {
  id: string
  authorId: string
  authorUsername?: string
  authorDisplayName?: string
  authorAvatarUrl?: string | null
  title: string
  body: string
  category: string
  visibility: 'PUBLIC' | 'GROUP_ONLY' | 'PRIVATE'
  allowAnonymous: boolean
  prayedCount: number
  groupIds?: string[]
  groupNames?: string[]
  prayerTypeCounts?: Record<string, number>
  myPrayerTypes?: string[]
  createdAt: string
}

type Profile = { id: string; tradition?: Tradition }
type GroupLite = { id: string; name: string }

type ActionRecord = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  actionType: string
  createdAt: string
}

type UpdateRecord = {
  id: string
  prayerRequestId: string
  authorId: string
  authorUsername?: string
  authorDisplayName?: string
  body: string
  createdAt: string
}

function relativeShort(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const diff = Date.now() - d
  const min = Math.floor(diff / 60000)
  if (min < 1) return i18n.t('time.now')
  if (min < 60) return i18n.t('reqDetail.min', { count: min })
  const h = Math.floor(min / 60)
  if (h < 24) return i18n.t('reqDetail.hour', { count: h })
  const day = Math.floor(h / 24)
  if (day < 7) return i18n.t('reqDetail.day', { count: day })
  return new Date(iso).toLocaleDateString(i18n.language)
}

const CATEGORY_PALETTE: Record<string, { bg: string; fg: string }> = {
  HEALTH: { bg: 'oklch(0.93 0.03 145)', fg: 'oklch(0.38 0.08 145)' },
  FAMILY: { bg: 'oklch(0.94 0.03 25)', fg: 'oklch(0.42 0.10 25)' },
  WORK: { bg: 'oklch(0.93 0.03 175)', fg: 'oklch(0.38 0.08 190)' },
  GRIEF: { bg: 'oklch(0.93 0.02 250)', fg: 'oklch(0.40 0.06 250)' },
  THANKSGIVING: { bg: 'oklch(0.93 0.04 95)', fg: 'oklch(0.40 0.10 80)' },
  OTHER: { bg: 'oklch(0.93 0.03 220)', fg: 'oklch(0.38 0.08 220)' }
}

function relativeTime(iso: string): string {
  const d = new Date(iso).getTime()
  if (Number.isNaN(d)) return ''
  const diff = Date.now() - d
  const min = Math.floor(diff / 60000)
  if (min < 1) return i18n.t('time.now')
  if (min < 60) return i18n.t('reqDetail.min', { count: min })
  const h = Math.floor(min / 60)
  if (h < 24) return i18n.t('reqDetail.hour', { count: h })
  const day = Math.floor(h / 24)
  if (day < 7) return i18n.t('reqDetail.day', { count: day })
  if (day < 30) return i18n.t('reqDetail.week', { count: Math.floor(day / 7) })
  if (day < 365) return i18n.t('reqDetail.month', { count: Math.floor(day / 30) })
  return i18n.t('reqDetail.year', { count: Math.floor(day / 365) })
}

export function RequestDetailPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const client = useQueryClient()
  const confirm = useConfirm()
  const [error, setError] = useState('')
  const [optimisticActive, setOptimisticActive] = useState<Record<string, boolean>>({})

  const requestQuery = useQuery({
    queryKey: ['request', id],
    enabled: !!id,
    queryFn: async () => (await api.get<RequestDetail>(`/requests/${id}`)).data
  })

  const profileQuery = useQuery({
    queryKey: ['profile', 'minimal'],
    queryFn: async () => (await api.get<Profile>('/profile')).data
  })

  const groupsQuery = useQuery({
    queryKey: ['groups', 'mine', 'request-detail'],
    queryFn: async () => (await api.get<{ items: GroupLite[] }>('/groups')).data.items ?? []
  })

  const actionsQuery = useQuery({
    queryKey: ['request', id, 'actions'],
    enabled: !!id,
    queryFn: async () => (await api.get<{ items: ActionRecord[] }>(`/requests/${id}/actions`)).data.items ?? []
  })

  const updatesQuery = useQuery({
    queryKey: ['request', id, 'updates'],
    enabled: !!id,
    queryFn: async () => (await api.get<{ items: UpdateRecord[] }>(`/requests/${id}/updates`)).data.items ?? []
  })

  const [updateBody, setUpdateBody] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [updateOpen, setUpdateOpen] = useState(false)

  const createUpdate = useMutation({
    mutationFn: async () => {
      await api.post(`/requests/${id}/updates`, { body: updateBody.trim() })
    },
    onSuccess: async () => {
      setUpdateBody('')
      setUpdateOpen(false)
      setUpdateError('')
      await updatesQuery.refetch()
    },
    onError: (err: any) => {
      setUpdateError(err?.response?.data?.error?.message || t('reqDetail.updatePublishError'))
    }
  })

  const data = requestQuery.data
  const isOwner = !!data && !!profileQuery.data && data.authorId === profileQuery.data.id
  const tradition = profileQuery.data?.tradition
  const visibleReactions = useMemo<PrayerAction[]>(() => prayerActionsFor(tradition), [tradition])
  const total = useMemo(
    () =>
      visibleReactions.reduce(
        (sum, action) => sum + (data?.prayerTypeCounts?.[action.type] ?? 0),
        0
      ),
    [visibleReactions, data]
  )

  useEffect(() => {
    if (data?.myPrayerTypes) {
      const map: Record<string, boolean> = {}
      data.myPrayerTypes.forEach((t) => {
        map[t] = true
      })
      setOptimisticActive(map)
    }
  }, [data?.myPrayerTypes])

  const pray = useMutation({
    mutationFn: async (actionType: string) => {
      await api.post(`/requests/${id}/pray`, { actionType })
    },
    onSuccess: async () => {
      setError('')
      await requestQuery.refetch()
      await client.invalidateQueries({ queryKey: ['feed'] })
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || t('reqDetail.prayError'))
    }
  })

  const remove = useMutation({
    mutationFn: async () => {
      await api.delete(`/requests/${id}`)
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['feed'] })
      navigate('/feed', { replace: true })
    }
  })

  const toggleGroup = useMutation({
    mutationFn: async (newGroupIds: string[]) => {
      if (!data) return
      await api.patch(`/requests/${id}`, {
        title: data.title,
        body: data.body,
        category: data.category,
        visibility: data.visibility,
        allowAnonymous: data.allowAnonymous,
        groupIds: newGroupIds
      })
    },
    onSuccess: async () => {
      await requestQuery.refetch()
    }
  })

  async function onDelete() {
    const ok = await confirm({
      title: t('reqDetail.deleteTitle'),
      description: t('reqDetail.deleteDesc'),
      confirmLabel: t('card.delete'),
      destructive: true
    })
    if (ok) remove.mutate()
  }

  function handlePress(action: PrayerAction) {
    if (pray.isPending) return
    setOptimisticActive((prev) => ({ ...prev, [action.type]: !prev[action.type] }))
    pray.mutate(action.type)
  }

  return (
    <PageShell>
      <main className="detail">
        <button type="button" className="detail__back" onClick={() => navigate(-1)}>
          <span aria-hidden>←</span> {t('reqDetail.back')}
        </button>

        {requestQuery.isLoading && (
          <p style={{ color: 'var(--muted)', fontSize: 14 }}>{t('reqDetail.loading')}</p>
        )}
        {requestQuery.isError && (
          <p
            role="alert"
            style={{
              border: '1px solid var(--line-2)',
              background: 'var(--card-2)',
              color: 'var(--ink-2)',
              padding: '10px 14px',
              borderRadius: 'var(--r-2)',
              fontSize: 14
            }}
          >
            {t('reqDetail.loadError')}
          </p>
        )}

        {data && (
          <>
            <article className="detail__post">
              <header className="detail__head">
                <Avatar
                  user={{
                    displayName: data.authorDisplayName,
                    username: data.authorUsername,
                    avatarUrl: data.authorAvatarUrl
                  }}
                  size="lg"
                  linkToProfile={!!data.authorUsername}
                />
                <div className="detail__id">
                  <div className="detail__name">{data.authorDisplayName || t('card.member')}</div>
                  <div className="detail__meta">
                    {data.authorUsername && (
                      <>
                        <span>@{data.authorUsername}</span>
                        <span className="post__sep">·</span>
                      </>
                    )}
                    <span>{relativeTime(data.createdAt)}</span>
                    {isOwner && data.allowAnonymous && (
                      <span className="anon-flag" title={t('card.anonymousTitle')}>
                        {t('card.anonymousFlag')}
                      </span>
                    )}
                  </div>
                </div>
                <span
                  className="cat-pill"
                  style={{
                    background: (CATEGORY_PALETTE[data.category] || CATEGORY_PALETTE.OTHER).bg,
                    color: (CATEGORY_PALETTE[data.category] || CATEGORY_PALETTE.OTHER).fg
                  }}
                >
                  {categoryLabel(data.category)}
                </span>
              </header>

              <h1 className="detail__title">{data.title}</h1>
              <p className="detail__body">{data.body}</p>

              {total > 0 && (
                <div className="detail__total">
                  <span className="detail__total-num">{total}</span>
                  <span className="detail__total-label">{t('reqDetail.totalLabel')}</span>
                </div>
              )}

              <div className="detail__reactions">
                {visibleReactions.map((action) => {
                  const count = data.prayerTypeCounts?.[action.type] ?? 0
                  const active = !!optimisticActive[action.type]
                  return (
                    <button
                      key={action.type}
                      type="button"
                      onClick={() => handlePress(action)}
                      disabled={pray.isPending}
                      className={`rx ${active ? 'rx--on' : ''}`}
                      style={
                        {
                          '--rx-bg': action.bg,
                          '--rx-border': action.border,
                          '--rx-fg': action.fg,
                          '--rx-dot': action.dot
                        } as Record<string, string>
                      }
                    >
                      <span className="rx__emoji" aria-hidden>
                        {action.emoji}
                      </span>
                      <span className="rx__label">{action.label}</span>
                      {count > 0 && <span className="rx__count">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </article>

            {error && (
              <p
                role="alert"
                style={{
                  border: '1px solid var(--line-2)',
                  background: 'var(--card-2)',
                  color: 'var(--ink-2)',
                  padding: '10px 14px',
                  borderRadius: 'var(--r-2)',
                  marginBottom: 24,
                  fontSize: 14
                }}
              >
                {error}
              </p>
            )}

            {/* Quem rezou — agrupado por reação */}
            {total > 0 && (
              <section className="detail__section">
                <h2 className="detail__h2">{t('reqDetail.whoPrayed')}</h2>
                <div className="prayed-list">
                  {visibleReactions
                    .filter((r) => (data.prayerTypeCounts?.[r.type] ?? 0) > 0)
                    .map((r) => {
                      const count = data.prayerTypeCounts?.[r.type] ?? 0
                      const people = (actionsQuery.data ?? []).filter((a) => a.actionType === r.type)
                      const visiblePeople = people.slice(0, 6)
                      const overflow = people.length - visiblePeople.length
                      return (
                        <div key={r.type} className="prayed-row">
                          <div className="prayed-row__head">
                            <span
                              className="prayed-row__glyph"
                              style={{ background: r.bg, color: r.fg }}
                            >
                              <Glyph kind={r.glyph} size={12} color={r.dot} />
                            </span>
                            <span className="prayed-row__label">{r.label}</span>
                            <span className="prayed-row__count">{count}</span>
                          </div>
                          <div className="prayed-row__people">
                            {visiblePeople.length > 0 ? (
                              <>
                                {visiblePeople.map((p) => (
                                  <Link
                                    key={`${r.type}-${p.userId}-${p.createdAt}`}
                                    to={`/u/${p.username}`}
                                    className="prayed-pill"
                                    style={{ textDecoration: 'none' }}
                                  >
                                    {p.displayName || `@${p.username}`}
                                  </Link>
                                ))}
                                {overflow > 0 && (
                                  <span className="prayed-pill prayed-pill--more">+{overflow}</span>
                                )}
                              </>
                            ) : (
                              <span className="prayed-pill prayed-pill--more">
                                {t('reqDetail.peopleCount', { count })}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                </div>
              </section>
            )}

            {/* Atualizações do autor — lista pra todo mundo, form só pro autor */}
            {(updatesQuery.data && updatesQuery.data.length > 0) || isOwner ? (
              <section className="detail__section">
                <h2 className="detail__h2">{t('reqDetail.authorUpdates')}</h2>
                <div className="updates">
                  {(updatesQuery.data ?? []).map((u) => (
                    <div key={u.id} className="update">
                      <span className="update__when">{relativeShort(u.createdAt)}</span>
                      <p className="update__text">{u.body}</p>
                    </div>
                  ))}

                  {isOwner && updateOpen && (
                    <div
                      style={{
                        background: 'var(--card)',
                        border: '1px solid var(--line-2)',
                        borderRadius: 'var(--r-2)',
                        padding: 14,
                        marginTop: 4
                      }}
                    >
                      <textarea
                        value={updateBody}
                        onChange={(e) => setUpdateBody(e.target.value)}
                        placeholder={t('reqDetail.updatePlaceholder')}
                        rows={3}
                        style={{
                          width: '100%',
                          fontFamily: 'var(--serif)',
                          fontSize: 16,
                          color: 'var(--ink)',
                          background: 'transparent',
                          border: 0,
                          resize: 'vertical',
                          outline: 'none'
                        }}
                        autoFocus
                      />
                      {updateError && (
                        <p
                          role="alert"
                          style={{
                            color: 'var(--ink-2)',
                            fontSize: 12,
                            margin: '8px 0 0',
                            background: 'var(--card-2)',
                            border: '1px solid var(--line-2)',
                            padding: '6px 10px',
                            borderRadius: 'var(--r-1)'
                          }}
                        >
                          {updateError}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                        <button
                          type="button"
                          className="btn btn--ghost"
                          onClick={() => {
                            setUpdateOpen(false)
                            setUpdateBody('')
                            setUpdateError('')
                          }}
                          disabled={createUpdate.isPending}
                        >
                          {t('common.cancel')}
                        </button>
                        <button
                          type="button"
                          className="btn btn--primary"
                          onClick={() => createUpdate.mutate()}
                          disabled={createUpdate.isPending || !updateBody.trim()}
                        >
                          {createUpdate.isPending ? t('request.publishing') : t('reqDetail.publish')}
                        </button>
                      </div>
                    </div>
                  )}

                  {isOwner && !updateOpen && (
                    <button
                      type="button"
                      className="update__add"
                      onClick={() => setUpdateOpen(true)}
                    >
                      {t('reqDetail.addUpdate')}
                    </button>
                  )}
                </div>
              </section>
            ) : null}

            {/* Compartilhar com */}
            {isOwner && (
              <section className="detail__section">
                <h2 className="detail__h2">{t('reqDetail.shareWith')}</h2>
                <div className="share">
                  {(groupsQuery.data ?? []).map((g) => {
                    const isShared = (data.groupIds ?? []).includes(g.id)
                    return (
                      <button
                        key={g.id}
                        type="button"
                        className="share__chip"
                        style={isShared ? { borderColor: 'var(--ink)', color: 'var(--ink)' } : undefined}
                        disabled={toggleGroup.isPending}
                        onClick={() => {
                          const current = data.groupIds ?? []
                          const next = isShared
                            ? current.filter((x) => x !== g.id)
                            : [...current, g.id]
                          toggleGroup.mutate(next)
                        }}
                      >
                        {isShared ? '✓ ' : ''}
                        {g.name}
                      </button>
                    )
                  })}
                  {(groupsQuery.data ?? []).length === 0 && (
                    <span className="share__chip share__chip--ghost">
                      {t('reqDetail.noGroups')}
                    </span>
                  )}
                </div>
              </section>
            )}

            {isOwner && (
              <section className="detail__section">
                <button
                  type="button"
                  onClick={onDelete}
                  disabled={remove.isPending}
                  style={{
                    color: 'var(--muted)',
                    background: 'none',
                    border: 0,
                    fontSize: 13,
                    cursor: 'pointer',
                    padding: '8px 0'
                  }}
                >
                  {remove.isPending ? t('reqDetail.deleting') : t('reqDetail.deleteRequest')}
                </button>
              </section>
            )}
          </>
        )}
      </main>
    </PageShell>
  )
}
