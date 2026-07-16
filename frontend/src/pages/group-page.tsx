import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Button } from '@/components/button'
import { Input } from '@/components/input'
import { TextArea } from '@/components/text-area'
import { FeedCard, flattenFeedItem, type FeedCardItem } from '@/components/feed-card'
import { FeedSkeleton } from '@/components/feed-skeleton'
import { Avatar } from '@/components/avatar'
import { NewRequestModal } from '@/components/new-request-modal'
import { api } from '@/lib/api'
import i18n from '@/lib/i18n'
import { prayerActionsFor, type Tradition } from '@/lib/traditions'
import {
  ImageUploadError,
  IMAGE_ACCEPTED_MIMES,
  IMAGE_MAX_BYTES,
  uploadGroupCover
} from '@/lib/supabase'

type Role = 'MEMBER' | 'MODERATOR' | 'ADMIN'
type JoinPolicy = 'OPEN' | 'REQUEST' | 'INVITE_ONLY'

type GroupDetails = {
  id: string
  name: string
  description: string
  imageUrl?: string | null
  joinPolicy: JoinPolicy
  requiresModeration: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  memberCount: number
  myRole?: Role | null
  isMember: boolean
  hasPendingJoin: boolean
}

type Member = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  role: Role
  joinedAt: string
}

type JoinRequest = {
  id: string
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  requestedAt: string
}

type ProfileMini = { id: string; tradition?: Tradition }

type RawGroupFeedResponse = {
  items: Parameters<typeof flattenFeedItem>[0][]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

type GroupFeedResponse = {
  items: FeedCardItem[]
  pagination: { page: number; pageSize: number; total: number; totalPages: number }
}

const roleLabel = (role: Role): string => i18n.t(`group.role.${role}`)

const policyLabel = (policy: JoinPolicy): string => i18n.t(`group.policy.${policy}`)

const ROLE_RANK: Record<Role, number> = { ADMIN: 3, MODERATOR: 2, MEMBER: 1 }

type Tab = 'mural' | 'members' | 'requests' | 'settings'

const tabs: Array<{ key: Tab; labelKey: string; needsRole?: Role }> = [
  { key: 'mural', labelKey: 'nav.mural' },
  { key: 'members', labelKey: 'group.tabMembers' },
  { key: 'requests', labelKey: 'group.tabRequests', needsRole: 'MODERATOR' },
  { key: 'settings', labelKey: 'group.tabSettings', needsRole: 'ADMIN' }
]

function canSee(role: Role | null | undefined, needs: Role | undefined): boolean {
  if (!needs) return true
  if (!role) return false
  return ROLE_RANK[role] >= ROLE_RANK[needs]
}

function formatDate(value: string): string {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat(i18n.language || 'pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
}

export function GroupPage() {
  const { t } = useTranslation()
  const { id = '' } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const queryClient = useQueryClient()
  const tabParam = (searchParams.get('tab') as Tab) || 'mural'

  const profileQuery = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => (await api.get<ProfileMini>('/profile')).data
  })

  const detailsQuery = useQuery({
    queryKey: ['group', id, 'details'],
    enabled: !!id,
    queryFn: async () => (await api.get<GroupDetails>(`/groups/${id}`)).data
  })

  const details = detailsQuery.data
  const myRole = details?.myRole ?? null

  const visibleTabs = tabs.filter((tabItem) => canSee(myRole, tabItem.needsRole))
  const tab: Tab = visibleTabs.some((tabItem) => tabItem.key === tabParam) ? tabParam : 'mural'

  const setTab = (next: Tab) => setSearchParams({ tab: next })

  return (
    <PageShell>
      <GroupHeader details={details} loading={detailsQuery.isLoading} />

      <div className="pv-panel mt-5 overflow-hidden rounded-3xl">
        <nav className="flex overflow-x-auto border-b border-primary/20 px-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {visibleTabs.map((tabItem) => (
            <button
              key={tabItem.key}
              type="button"
              className={`pv-tab-underline ${tab === tabItem.key ? 'pv-tab-underline-active' : ''}`}
              onClick={() => setTab(tabItem.key)}
              aria-current={tab === tabItem.key ? 'page' : undefined}
            >
              {t(tabItem.labelKey)}
            </button>
          ))}
        </nav>

        {tab === 'mural' && (
          <GroupMural
            groupId={id}
            viewerId={profileQuery.data?.id}
            tradition={profileQuery.data?.tradition}
            queryClient={queryClient}
            myRole={myRole}
          />
        )}
        {tab === 'members' && (
          <MembersTab groupId={id} myRole={myRole} viewerId={profileQuery.data?.id} />
        )}
        {tab === 'requests' && canSee(myRole, 'MODERATOR') && (
          <RequestsTab groupId={id} />
        )}
        {tab === 'settings' && canSee(myRole, 'ADMIN') && details && (
          <SettingsTab details={details} />
        )}
      </div>
    </PageShell>
  )
}

function GroupHeader({ details, loading }: { details?: GroupDetails; loading: boolean }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  const requestJoin = useMutation({
    mutationFn: async () => {
      if (!details) return
      await api.post(`/groups/${details.id}/join-requests`)
    },
    onSuccess: async () => {
      if (details) await queryClient.invalidateQueries({ queryKey: ['group', details.id, 'details'] })
    }
  })

  const leave = useMutation({
    mutationFn: async () => {
      if (!details) return
      await api.post(`/groups/${details.id}/leave`)
    },
    onSuccess: async () => {
      if (details) {
        await queryClient.invalidateQueries({ queryKey: ['group', details.id, 'details'] })
        await queryClient.invalidateQueries({ queryKey: ['group', details.id, 'members'] })
      }
    }
  })

  if (loading || !details) {
    return (
      <section className="pv-panel overflow-hidden rounded-3xl">
        <div className="pv-shimmer aspect-[16/5] w-full" />
        <div className="px-5 pb-5 sm:px-7 sm:pb-7">
          <span className="pv-shimmer -mt-10 block h-20 w-20 rounded-2xl border-4 border-[var(--panel-surface)]" />
          <span className="pv-shimmer mt-3 block h-6 w-1/2 rounded" />
          <span className="pv-shimmer mt-2 block h-4 w-3/4 rounded" />
        </div>
      </section>
    )
  }

  const initials = details.name.slice(0, 2).toUpperCase()
  const actionLabel = leave.error
    ? (leave.error as any)?.response?.data?.error?.message || t('group.leaveError')
    : null

  return (
    <section className="pv-panel overflow-hidden rounded-3xl">
      {details.imageUrl ? (
        <img
          src={details.imageUrl}
          alt=""
          className="aspect-[16/5] w-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          aria-hidden
          className="aspect-[16/5] w-full bg-gradient-to-br from-primary/35 via-primary/15 to-primary/5"
        />
      )}
      <div className="px-5 pb-5 sm:px-7 sm:pb-7">
        <div className="-mt-10 flex items-end gap-4">
          {details.imageUrl ? (
            <img
              src={details.imageUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-2xl border-4 border-[var(--panel-surface)] bg-bg object-cover shadow-[0_8px_24px_-12px_rgba(var(--shadow-rgb),0.5)]"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-[var(--panel-surface)] bg-bg text-lg font-bold text-primary shadow-[0_8px_24px_-12px_rgba(var(--shadow-rgb),0.5)]">
              {initials}
            </span>
          )}
          <div className="min-w-0 flex-1 pb-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t('group.eyebrow')}</p>
            <h1 className="pv-title mt-0.5 text-2xl font-bold leading-tight text-secondary sm:text-3xl">
              {details.name}
            </h1>
          </div>
        </div>

        <div className="pv-muted mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>{t('group.memberCount', { count: details.memberCount })}</span>
          <span aria-hidden>·</span>
          <span>{policyLabel(details.joinPolicy)}</span>
          {details.myRole && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-primary">
              {t('group.youAre', { role: roleLabel(details.myRole) })}
            </span>
          )}
        </div>

        {details.description && (
          <p className="pv-muted mt-3 max-w-2xl text-sm leading-relaxed">{details.description}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {!details.isMember && !details.hasPendingJoin && details.joinPolicy !== 'INVITE_ONLY' && (
            <Button onClick={() => requestJoin.mutate()} disabled={requestJoin.isPending}>
              {details.joinPolicy === 'OPEN' ? t('group.join') : t('group.requestJoin')}
            </Button>
          )}
          {details.hasPendingJoin && (
            <span className="inline-flex items-center rounded-full border border-primary px-3 py-1.5 text-xs font-semibold text-primary">
              {t('group.pendingRequest')}
            </span>
          )}
          {details.isMember && (
            <Button variant="secondary" onClick={() => leave.mutate()} disabled={leave.isPending}>
              {leave.isPending ? t('group.leaving') : t('group.leave')}
            </Button>
          )}
        </div>

        {actionLabel && (
          <p className="mt-3 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{actionLabel}</p>
        )}
      </div>
    </section>
  )
}

function GroupMural({
  groupId,
  viewerId,
  tradition,
  queryClient,
  myRole
}: {
  groupId: string
  viewerId?: string
  tradition?: Tradition
  queryClient: ReturnType<typeof useQueryClient>
  myRole: Role | null
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const canPostAnnouncement = !!myRole && ROLE_RANK[myRole] >= ROLE_RANK.MODERATOR
  const [page, setPage] = useState(1)
  const [lastHit, setLastHit] = useState<{ requestID: string; actionType: string; fxID: number } | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const pageSize = 10

  const feedQuery = useQuery({
    queryKey: ['group', groupId, 'feed', page],
    enabled: !!groupId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GroupFeedResponse> => {
      const res = await api.get<RawGroupFeedResponse>(`/groups/${groupId}/feed`, {
        params: { limit: pageSize, offset: (page - 1) * pageSize }
      })
      return {
        items: res.data.items.map(flattenFeedItem),
        pagination: res.data.pagination
      }
    }
  })

  const prayerActions = useMemo(() => prayerActionsFor(tradition ?? 'CATHOLIC'), [tradition])

  const prayMutation = useMutation({
    mutationFn: async ({ requestID, actionType }: { requestID: string; actionType: string }) => {
      await api.post(`/requests/${requestID}/pray`, { actionType })
    },
    onMutate: async ({ requestID, actionType }) => {
      await queryClient.cancelQueries({ queryKey: ['group', groupId, 'feed', page] })
      const previous = queryClient.getQueryData<GroupFeedResponse>(['group', groupId, 'feed', page])
      if (previous) {
        queryClient.setQueryData<GroupFeedResponse>(['group', groupId, 'feed', page], {
          ...previous,
          items: previous.items.map((it) =>
            it.kind === 'PRAYER_REQUEST' && it.id === requestID
              ? {
                  ...it,
                  prayedCount: it.prayedCount + 1,
                  prayerTypeCounts: {
                    ...(it.prayerTypeCounts ?? {}),
                    [actionType]: (it.prayerTypeCounts?.[actionType] ?? 0) + 1
                  }
                }
              : it
          )
        })
      }
      setLastHit({ requestID, actionType, fxID: Date.now() })
      return { previous }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(['group', groupId, 'feed', page], ctx.previous)
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['group', groupId, 'feed'] })
    }
  })

  const items = feedQuery.data?.items ?? []
  const totalPages = Math.max(feedQuery.data?.pagination.totalPages ?? 1, 1)
  const showSkeleton = feedQuery.isLoading && !feedQuery.data
  const groupNameById = useMemo(() => new Map<string, string>(), [])

  return (
    <div className="divide-y divide-primary/20">
      {canPostAnnouncement && (
        <div className="flex flex-wrap items-center gap-2 px-5 py-3">
          <button
            type="button"
            onClick={() => navigate(`/groups/${groupId}/announcements/new`)}
            className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-onPrimary"
          >
            <span aria-hidden>📣</span>
            <span>{t('group.createAnnouncement')}</span>
          </button>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-panel px-3 py-1.5 text-xs font-semibold text-primary"
          >
            <span aria-hidden>🙏</span>
            <span>{t('feed.createRequest')}</span>
          </button>
        </div>
      )}
      {showSkeleton && <FeedSkeleton count={3} />}
      {!feedQuery.isLoading && items.length === 0 && (
        <div className="px-5 py-10 text-center">
          <p className="text-3xl" aria-hidden>🕊️</p>
          <p className="mt-2 text-sm font-semibold text-secondary">{t('group.noPosts')}</p>
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="mt-3 inline-block text-xs font-semibold text-primary hover:underline"
          >
            {t('feed.createRequest')}
          </button>
        </div>
      )}
      <NewRequestModal
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        defaultGroupId={groupId}
        onCreated={() => queryClient.invalidateQueries({ queryKey: ['group', groupId, 'feed'] })}
      />
      {items.map((item) => (
        <FeedCard
          key={item.id}
          item={item}
          viewerId={viewerId}
          prayerActions={prayerActions}
          onPray={(requestID, actionType) => prayMutation.mutate({ requestID, actionType })}
          isPrayPending={prayMutation.isPending}
          lastPrayerHit={lastHit}
          groupNameById={groupNameById}
          formatDate={formatDate}
        />
      ))}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-primary/20 px-5 py-3 text-xs">
          <span className="text-primary">{t('group.pageOf', { page, total: totalPages })}</span>
          <div className="flex gap-2">
            <button
              className="rounded-full border border-primary/40 px-3 py-1 text-primary disabled:opacity-40"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              type="button"
            >
              ← {t('common.previous')}
            </button>
            <button
              className="rounded-full border border-primary/40 px-3 py-1 text-primary disabled:opacity-40"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              type="button"
            >
              {t('common.next')} →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function MembersTab({ groupId, myRole, viewerId }: { groupId: string; myRole: Role | null; viewerId?: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const membersQuery = useQuery({
    queryKey: ['group', groupId, 'members'],
    enabled: !!groupId,
    queryFn: async () => {
      const res = await api.get<{ items: Member[]; total: number }>(`/groups/${groupId}/members`, {
        params: { limit: 100, offset: 0 }
      })
      return res.data
    }
  })

  const changeRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: Role }) => {
      await api.patch(`/groups/${groupId}/members/${userId}`, { role })
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group', groupId, 'members'] }),
        queryClient.invalidateQueries({ queryKey: ['group', groupId, 'details'] })
      ])
    }
  })

  const removeMember = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/groups/${groupId}/members/${userId}`)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group', groupId, 'members'] }),
        queryClient.invalidateQueries({ queryKey: ['group', groupId, 'details'] })
      ])
    }
  })

  if (membersQuery.isLoading) {
    return <FeedSkeleton count={4} />
  }
  if (membersQuery.error) {
    return <p className="px-5 py-6 text-sm text-secondary">{t('group.membersLoadError')}</p>
  }

  const items = membersQuery.data?.items ?? []
  const isAdmin = myRole === 'ADMIN'

  return (
    <ul className="divide-y divide-primary/20">
      {items.map((m) => {
        const isSelf = m.userId === viewerId
        const canRemove = !isSelf && !!myRole && ROLE_RANK[myRole] > ROLE_RANK[m.role]
        const canChangeRole = isAdmin && !isSelf
        return (
          <li key={m.userId} className="flex items-center gap-3 px-4 py-3 sm:px-5">
            <Avatar user={m} size="md" linkToProfile />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <Link to={`/u/${m.username}`} className="truncate text-sm font-semibold text-secondary hover:text-primary">{m.displayName || t('card.member')}</Link>
                <span className="truncate text-xs text-primary/80">@{m.username}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] ${m.role === 'ADMIN' ? 'bg-primary text-onPrimary' : m.role === 'MODERATOR' ? 'bg-primary/15 text-primary' : 'bg-primary/5 text-primary/80'}`}>
                  {roleLabel(m.role)}
                </span>
              </div>
              <p className="pv-muted text-[11px]">{t('group.joinedOn', { date: formatDate(m.joinedAt) })}</p>
            </div>
            {canChangeRole && (
              <select
                className="rounded-full border border-primary/40 bg-panel px-2 py-1 text-xs text-primary"
                value={m.role}
                onChange={(e) => changeRole.mutate({ userId: m.userId, role: e.target.value as Role })}
                disabled={changeRole.isPending}
                aria-label={t('group.changeRole')}
              >
                <option value="MEMBER">{t('group.role.MEMBER')}</option>
                <option value="MODERATOR">{t('group.role.MODERATOR')}</option>
                <option value="ADMIN">{t('group.role.ADMIN')}</option>
              </select>
            )}
            {canRemove && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(t('group.removeConfirm', { name: m.displayName || m.username }))) {
                    removeMember.mutate(m.userId)
                  }
                }}
                disabled={removeMember.isPending}
                className="rounded-full border border-primary/40 px-3 py-1 text-xs text-primary hover:bg-primary/10"
              >
                {t('group.remove')}
              </button>
            )}
          </li>
        )
      })}
      {items.length === 0 && (
        <li className="px-5 py-8 text-center text-sm text-secondary">{t('group.noMembers')}</li>
      )}
    </ul>
  )
}

function RequestsTab({ groupId }: { groupId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const requests = useQuery({
    queryKey: ['group', groupId, 'join-requests'],
    enabled: !!groupId,
    queryFn: async () => (await api.get<{ items: JoinRequest[] }>(`/groups/${groupId}/join-requests`)).data.items
  })

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'join-requests'] }),
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'members'] }),
      queryClient.invalidateQueries({ queryKey: ['group', groupId, 'details'] })
    ])
  }

  const approve = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/groups/${groupId}/join-requests/${requestId}/approve`)
    },
    onSuccess: invalidate
  })

  const reject = useMutation({
    mutationFn: async (requestId: string) => {
      await api.post(`/groups/${groupId}/join-requests/${requestId}/reject`)
    },
    onSuccess: invalidate
  })

  const pending = approve.isPending || reject.isPending

  if (requests.isLoading) return <FeedSkeleton count={2} />
  const items = requests.data ?? []
  if (items.length === 0) {
    return <p className="px-5 py-8 text-center text-sm text-secondary">{t('group.noRequests')}</p>
  }
  return (
    <ul className="divide-y divide-primary/20">
      {items.map((req) => {
        return (
          <li key={req.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar user={req} size="md" linkToProfile />
              <div className="min-w-0">
                <Link to={`/u/${req.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">{req.displayName || req.username}</Link>
                <p className="truncate text-xs text-primary/80">@{req.username}</p>
                <p className="pv-muted text-[11px]">{t('group.requestedOn', { date: formatDate(req.requestedAt) })}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="secondary" onClick={() => reject.mutate(req.id)} disabled={pending}>
                {t('group.reject')}
              </Button>
              <Button onClick={() => approve.mutate(req.id)} disabled={pending}>
                {t('group.approve')}
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function SettingsTab({ details }: { details: GroupDetails }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [name, setName] = useState(details.name)
  const [description, setDescription] = useState(details.description)
  const [imageUrl, setImageUrl] = useState<string | null>(details.imageUrl ?? null)
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>(details.joinPolicy)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [photoStatus, setPhotoStatus] = useState('')
  const [photoError, setPhotoError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const persistGroup = useMutation({
    mutationFn: async (overrides: { imageUrl?: string | null }) => {
      await api.patch(`/groups/${details.id}`, {
        name,
        description,
        imageUrl: overrides.imageUrl !== undefined ? overrides.imageUrl : imageUrl,
        joinPolicy
      })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['group', details.id, 'details'] })
      await queryClient.invalidateQueries({ queryKey: ['groups', 'mine'] })
    }
  })

  const update = useMutation({
    mutationFn: async () => persistGroup.mutateAsync({}),
    onSuccess: async () => {
      setStatus(t('group.groupUpdated'))
      setError('')
    },
    onError: (err: any) => {
      setStatus('')
      setError(err?.response?.data?.error?.message || t('group.updateError'))
    }
  })

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const url = await uploadGroupCover(file, details.id)
      await persistGroup.mutateAsync({ imageUrl: url })
      return url
    },
    onSuccess: (url) => {
      setImageUrl(url)
      setPhotoError('')
      setPhotoStatus(t('group.photoUpdated'))
    },
    onError: (err: unknown) => {
      setPhotoStatus('')
      if (err instanceof ImageUploadError) {
        setPhotoError(err.message)
      } else {
        setPhotoError(t('group.photoSaveError'))
      }
    }
  })

  const removePhoto = useMutation({
    mutationFn: async () => persistGroup.mutateAsync({ imageUrl: null }),
    onSuccess: () => {
      setImageUrl(null)
      setPhotoError('')
      setPhotoStatus(t('group.photoRemoved'))
    },
    onError: () => {
      setPhotoStatus('')
      setPhotoError(t('group.photoRemoveError'))
    }
  })

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    setPhotoStatus('')
    uploadPhoto.mutate(file)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setStatus('')
    setError('')
    update.mutate()
  }

  const photoBusy = uploadPhoto.isPending || removePhoto.isPending
  const acceptAttr = IMAGE_ACCEPTED_MIMES.join(',')
  const maxMb = Math.round(IMAGE_MAX_BYTES / (1024 * 1024))

  return (
    <form onSubmit={onSubmit} className="space-y-5 px-5 py-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">{t('group.photoLabel')}</p>
        <p className="pv-muted mt-1 text-[11px]">{t('group.photoHelp', { max: maxMb })}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-16 w-16 rounded-2xl border-2 border-primary object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="inline-flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-primary bg-bg text-lg font-bold text-primary">
              {details.name.slice(0, 2).toUpperCase()}
            </span>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptAttr}
            className="hidden"
            onChange={onFileChange}
            aria-label={t('group.selectPhoto')}
          />
          <Button
            type="button"
            disabled={photoBusy}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploadPhoto.isPending ? t('profile.uploading') : imageUrl ? t('profile.changePhoto') : t('profile.uploadPhoto')}
          </Button>
          {imageUrl && (
            <Button
              type="button"
              variant="secondary"
              disabled={photoBusy}
              onClick={() => removePhoto.mutate()}
            >
              {t('group.removePhoto')}
            </Button>
          )}
        </div>
        {photoStatus && <p role="status" className="mt-3 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{photoStatus}</p>}
        {photoError && <p role="alert" className="mt-3 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{photoError}</p>}
      </div>

      <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        {t('group.nameLabel')}
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('group.namePlaceholder')} />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        {t('group.descriptionLabel')}
        <TextArea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('group.descriptionPlaceholder')} />
      </label>
      <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
        {t('group.joinPolicyLabel')}
        <select
          className="mt-1 block w-full rounded-2xl border border-primary bg-panel px-3 py-2 text-sm text-secondary"
          value={joinPolicy}
          onChange={(e) => setJoinPolicy(e.target.value as JoinPolicy)}
        >
          <option value="OPEN">{t('group.policy.OPEN')}</option>
          <option value="REQUEST">{t('group.policyRequestAdmin')}</option>
          <option value="INVITE_ONLY">{t('group.policy.INVITE_ONLY')}</option>
        </select>
      </label>
      {status && <p className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{status}</p>}
      {error && <p className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{error}</p>}
      <Button type="submit" disabled={update.isPending}>
        {update.isPending ? t('common.saving') : t('profile.saveChanges')}
      </Button>
    </form>
  )
}
