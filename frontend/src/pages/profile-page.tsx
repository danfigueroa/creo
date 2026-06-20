import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { api } from '@/lib/api'
import { Input } from '@/components/input'
import { TextArea } from '@/components/text-area'
import { Button } from '@/components/button'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { errorMessage } from '@/lib/api-error'
import { Tradition, traditionOptions } from '@/lib/traditions'
import { LANGUAGES } from '@/lib/i18n'
import { useLanguage } from '@/lib/use-language'
import { AvatarUploadError, AVATAR_MAX_BYTES, AVATAR_ACCEPTED_MIMES, getSupabaseClient, uploadAvatar } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'

const BIO_MAX = 280

type Profile = {
  id: string
  username: string
  displayName: string
  avatarUrl?: string | null
  bio?: string | null
  tradition: Tradition
}

export function ProfilePage() {
  const { t } = useTranslation()
  const { current: currentLanguage, change: changeLanguage } = useLanguage()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [avatarStatus, setAvatarStatus] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [traditionStatus, setTraditionStatus] = useState('')

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await api.get<Profile>('/profile')
      return res.data
    }
  })

  type ProfileStats = {
    requestsCreated: number
    prayerActionsTotal: number
    prayerActionsReceived: number
    streakDays: number
  }
  const stats = useQuery({
    queryKey: ['profile', 'stats'],
    queryFn: async () => (await api.get<ProfileStats>('/profile/stats')).data
  })

  useEffect(() => {
    if (!profile.data) return
    setDisplayName(profile.data.displayName || '')
    setUsername(profile.data.username || '')
    setBio(profile.data.bio || '')
  }, [profile.data])

  const invalidateProfileEverywhere = async () => {
    await Promise.all([
      profile.refetch(),
      queryClient.invalidateQueries({ queryKey: ['profile', 'shell'] }),
      queryClient.invalidateQueries({ queryKey: ['profile', 'public'] })
    ])
  }

  const traditionMutation = useMutation({
    mutationFn: async (tradition: Tradition) => {
      const res = await api.patch<Profile>('/profile/tradition', { tradition })
      return res.data
    },
    onSuccess: async () => {
      setTraditionStatus(t('profile.traditionUpdated'))
      await Promise.all([
        invalidateProfileEverywhere(),
        queryClient.invalidateQueries({ queryKey: ['profile', 'feed'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] })
      ])
    },
    onError: () => {
      setTraditionStatus(t('profile.traditionError'))
    }
  })

  const saveProfile = useMutation({
    mutationFn: async () => {
      const trimmedBio = bio.trim()
      await api.patch('/profile', {
        displayName,
        username,
        bio: trimmedBio === '' ? null : trimmedBio
      })
    },
    onSuccess: async () => {
      setError('')
      setStatus(t('profile.profileUpdated'))
      await invalidateProfileEverywhere()
    },
    onError: (err: any) => {
      setStatus('')
      if (err?.response?.status === 401) {
        setError(t('profile.sessionExpired'))
        return
      }
      setError(err?.response?.data?.error?.message || err?.message || t('profile.saveError'))
    }
  })

  const updateAvatar = useMutation({
    mutationFn: async (avatarUrl: string | null) => {
      const res = await api.patch<Profile>('/profile', {
        displayName,
        username,
        avatarUrl
      })
      return res.data
    },
    onSuccess: async (_data, variables) => {
      setAvatarError('')
      setAvatarStatus(variables ? t('profile.photoUpdated') : t('profile.photoRemoved'))
      await invalidateProfileEverywhere()
    },
    onError: () => {
      setAvatarStatus('')
      setAvatarError(t('profile.photoSaveError'))
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!profile.data) throw new Error(t('profile.notLoaded'))
      return uploadAvatar(file, profile.data.id)
    },
    onSuccess: (publicUrl) => {
      updateAvatar.mutate(publicUrl)
    },
    onError: (err: unknown) => {
      setAvatarStatus('')
      if (err instanceof AvatarUploadError) {
        setAvatarError(err.message)
      } else {
        setAvatarError(t('profile.uploadFailed'))
      }
    }
  })

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarError('')
    setAvatarStatus('')
    uploadMutation.mutate(file)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('')
    if (displayName.trim().length < 2) {
      setError(t('profile.displayNameMin'))
      return
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username.trim().replace('@', ''))) {
      setError(t('authPage.invalidUsername'))
      return
    }
    if (bio.trim().length > BIO_MAX) {
      setError(t('profile.bioMax', { max: BIO_MAX }))
      return
    }
    saveProfile.mutate()
  }

  const avatarUploadBusy = uploadMutation.isPending || updateAvatar.isPending
  const previewUser = {
    displayName: displayName || profile.data?.displayName,
    username: username || profile.data?.username,
    avatarUrl: profile.data?.avatarUrl ?? null
  }
  const bioCount = bio.trim().length
  const acceptAttr = AVATAR_ACCEPTED_MIMES.join(',')
  const maxMb = Math.round(AVATAR_MAX_BYTES / (1024 * 1024))

  return (
    <PageShell>
      <main className="profile">
        <div className="profile__cover" />
        <div className="profile__head">
          <Avatar user={previewUser} size="xl" />
          <div className="profile__idblock">
            <h1 className="profile__name">{displayName || profile.data?.displayName || t('profile.yourProfile')}</h1>
            <div className="profile__meta">
              <span>@{username || profile.data?.username || 'username'}</span>
            </div>
            {profile.data?.bio && (
              <p className="profile__bio">"{profile.data.bio}"</p>
            )}
          </div>
          <div className="profile__actions">
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttr}
              className="hidden"
              onChange={onFileChange}
              aria-label={t('profile.selectPhoto')}
            />
            <button
              type="button"
              className="btn btn--ghost-out"
              disabled={avatarUploadBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadMutation.isPending ? t('profile.uploading') : profile.data?.avatarUrl ? t('profile.changePhoto') : t('profile.uploadPhoto')}
            </button>
            {profile.data?.avatarUrl && (
              <button
                type="button"
                className="btn btn--ghost-out"
                disabled={avatarUploadBusy}
                onClick={() => {
                  setAvatarError('')
                  setAvatarStatus('')
                  updateAvatar.mutate(null)
                }}
                style={{ marginLeft: 8 }}
              >
                {t('profile.remove')}
              </button>
            )}
          </div>
        </div>

        {(avatarStatus || avatarError) && (
          <p
            role={avatarError ? 'alert' : 'status'}
            style={{
              marginBottom: 18,
              padding: '8px 12px',
              borderRadius: 'var(--r-2)',
              background: 'var(--card-2)',
              border: '1px solid var(--line-2)',
              color: 'var(--ink-2)',
              fontSize: 13
            }}
          >
            {avatarError || avatarStatus}
          </p>
        )}

        <section className="profile__stats">
          <div className="stat">
            <div className="stat__num">{stats.data?.prayerActionsTotal ?? '—'}</div>
            <div className="stat__label">{t('profile.statSent')}</div>
          </div>
          <div className="stat">
            <div className="stat__num">{stats.data?.prayerActionsReceived ?? '—'}</div>
            <div className="stat__label">{t('profile.statReceived')}</div>
          </div>
          <div className="stat">
            <div className="stat__num">{stats.data?.requestsCreated ?? '—'}</div>
            <div className="stat__label">{t('profile.statShared')}</div>
          </div>
          <div className="stat">
            <div className="stat__num">{stats.data?.streakDays ?? '—'}</div>
            <div className="stat__label">{t('profile.statStreak')}</div>
          </div>
        </section>

        <ProfileActivityTabs userId={profile.data?.id} />

      <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('profile.accountEyebrow')}</p>
        <h2 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">{t('profile.accountTitle')}</h2>
        <p className="pv-muted mt-2 text-sm">{t('profile.accountSub')}</p>

        <form className="mt-6 grid gap-5 lg:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              {t('authPage.displayName')}
              <Input onChange={(e) => setDisplayName(e.target.value)} placeholder={t('profile.displayNamePlaceholder')} value={displayName} />
              <span className="pv-muted mt-1 block text-[11px] normal-case tracking-normal">{t('profile.displayNameHelp')}</span>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              @username
              <Input onChange={(e) => setUsername(e.target.value.replace(/@/g, '').toLowerCase())} placeholder="seu_username" value={username} />
              <span className="pv-muted mt-1 block text-[11px] normal-case tracking-normal">{t('profile.usernameHelp')}</span>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <span className="flex items-baseline justify-between gap-2">
                <span>Bio</span>
                <span className={`text-[11px] tabular-nums ${bioCount > BIO_MAX ? 'text-primary' : 'pv-muted'}`}>{bioCount}/{BIO_MAX}</span>
              </span>
              <TextArea
                className="mt-1.5 min-h-[100px]"
                onChange={(e) => setBio(e.target.value)}
                placeholder={t('profile.bioPlaceholder')}
                value={bio}
              />
              <span className="pv-muted mt-1 block text-[11px] normal-case tracking-normal">{t('profile.bioHelp')}</span>
            </label>
          </div>

          <div className="rounded-2xl border border-primary bg-panel p-4">
            <p className="text-sm text-secondary">{t('profile.preview')}</p>
            <div className="mt-4 flex items-center gap-3">
              <Avatar user={previewUser} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-secondary">{displayName || t('profile.yourName')}</p>
                <p className="pv-muted truncate text-sm">@{username || 'username'}</p>
              </div>
            </div>
            {bio.trim() && <p className="pv-muted mt-3 whitespace-pre-line text-sm leading-relaxed text-secondary/90">{bio}</p>}

            {status && <p role="status" className="mt-4 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{status}</p>}
            {error && <p role="alert" className="mt-4 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{error}</p>}

            <Button className="mt-5 w-full sm:w-auto" disabled={saveProfile.isPending} type="submit">
              {saveProfile.isPending ? t('common.saving') : t('profile.saveChanges')}
            </Button>
          </div>
        </form>
      </section>

      <section id="idioma" className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('profile.languageEyebrow')}</p>
        <h2 className="pv-title mt-2 text-xl font-bold text-secondary sm:text-2xl">{t('profile.languageTitle')}</h2>
        <p className="pv-muted mt-2 text-sm">{t('profile.languageSub')}</p>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {LANGUAGES.map((lang) => {
            const active = currentLanguage === lang.code
            return (
              <button
                key={lang.code}
                type="button"
                disabled={active}
                onClick={() => changeLanguage(lang.code)}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition ${active ? 'border-primary bg-primary/10 shadow-[0_10px_24px_-16px_var(--fx-ring)]' : 'border-primary bg-panel hover:bg-primary/5'} disabled:cursor-default`}
                aria-pressed={active}
              >
                <span className="text-2xl leading-none" aria-hidden>{lang.flag}</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-secondary'}`}>
                    {lang.nativeLabel}{active ? t('profile.currentSuffix') : ''}
                  </span>
                </span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('profile.traditionEyebrow')}</p>
        <h2 className="pv-title mt-2 text-xl font-bold text-secondary sm:text-2xl">{t('profile.traditionTitle')}</h2>
        <p className="pv-muted mt-2 text-sm">
          {t('profile.traditionSub')}
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {traditionOptions().map((option) => {
            const active = profile.data?.tradition === option.value
            return (
              <button
                key={option.value}
                type="button"
                disabled={traditionMutation.isPending || active}
                onClick={() => {
                  setTraditionStatus('')
                  traditionMutation.mutate(option.value)
                }}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition ${active ? 'border-primary bg-primary/10 shadow-[0_10px_24px_-16px_var(--fx-ring)]' : 'border-primary bg-panel hover:bg-primary/5'} disabled:cursor-default`}
                aria-pressed={active}
              >
                <span className="text-2xl leading-none" aria-hidden>{option.emoji}</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-secondary'}`}>
                    {option.label}{active ? t('profile.currentSuffix') : ''}
                  </span>
                  <span className="block text-[12px] leading-snug text-primary/80">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>

        {traditionStatus && (
          <p className="mt-4 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{traditionStatus}</p>
        )}
      </section>

      <BlockedUsersSection />
      <SessionSection />
      </main>
    </PageShell>
  )
}

type ActivityTab = 'ativas' | 'encerradas' | 'rezadas' | 'linha'

type FeedItemRaw =
  | { kind: 'PRAYER_REQUEST'; createdAt: string; prayerRequest: { id: string; authorId: string; title: string; body: string; status: string; category: string; createdAt: string } }
  | { kind: 'ANNOUNCEMENT'; createdAt: string; announcement: unknown }

type FeedResponse = { items: FeedItemRaw[] }

type MyPrayerEntry = {
  requestId: string
  requestTitle: string
  authorId: string
  authorUsername: string
  authorDisplayName: string
  actionType: string
  createdAt: string
}

const TABS: Array<{ id: ActivityTab; labelKey: string }> = [
  { id: 'ativas', labelKey: 'profile.tabActive' },
  { id: 'encerradas', labelKey: 'profile.tabClosed' },
  { id: 'rezadas', labelKey: 'profile.tabPrayed' },
  { id: 'linha', labelKey: 'profile.tabTimeline' }
]

function ProfileActivityTabs({ userId }: { userId?: string }) {
  const { t } = useTranslation()
  const [tab, setTab] = useState<ActivityTab>('ativas')

  const homeQuery = useQuery({
    queryKey: ['feed', 'home', 'profile-activity'],
    enabled: !!userId,
    queryFn: async () => (await api.get<FeedResponse>('/feed/home', { params: { limit: 50 } })).data
  })

  const myPrayers = useQuery({
    queryKey: ['me', 'prayers'],
    enabled: !!userId && tab === 'rezadas',
    queryFn: async () => (await api.get<{ items: MyPrayerEntry[] }>('/me/prayers')).data.items ?? []
  })

  const myItems = (homeQuery.data?.items ?? [])
    .filter((it) => it.kind === 'PRAYER_REQUEST' && it.prayerRequest.authorId === userId)
    .map((it) => (it as Extract<FeedItemRaw, { kind: 'PRAYER_REQUEST' }>).prayerRequest)

  const ativas = myItems.filter((p) => p.status === 'ACTIVE' || p.status === 'PENDING_REVIEW')
  const encerradas = myItems.filter((p) => p.status !== 'ACTIVE' && p.status !== 'PENDING_REVIEW')

  return (
    <>
      <div className="tabs" role="tablist">
        {TABS.map((tabItem) => (
          <button
            key={tabItem.id}
            type="button"
            role="tab"
            aria-selected={tab === tabItem.id}
            className={`tab tab--auto ${tab === tabItem.id ? 'is-on' : ''}`}
            onClick={() => setTab(tabItem.id)}
          >
            {t(tabItem.labelKey)}
          </button>
        ))}
      </div>

      <div className="profile__panel">
        {tab === 'ativas' && (
          <ProfilePostsList items={ativas} loading={homeQuery.isLoading} emptyText={t('profile.emptyActive')} />
        )}
        {tab === 'encerradas' && (
          <ProfilePostsList items={encerradas} loading={homeQuery.isLoading} emptyText={t('profile.emptyClosed')} />
        )}
        {tab === 'rezadas' && (
          <PrivatePrayedList items={myPrayers.data ?? []} loading={myPrayers.isLoading} />
        )}
        {tab === 'linha' && (
          <p className="private__hint">
            {t('profile.timelineSoon')}
          </p>
        )}
      </div>
    </>
  )
}

function ProfilePostsList({
  items,
  loading,
  emptyText
}: {
  items: Array<{ id: string; title: string; body: string; status: string; createdAt: string; category: string }>
  loading: boolean
  emptyText: string
}) {
  const { t, i18n } = useTranslation()
  if (loading) {
    return <p className="private__hint">{t('common.loading')}</p>
  }
  if (items.length === 0) {
    return <p className="private__hint">{emptyText}</p>
  }
  return (
    <ul className="private__list">
      {items.map((p) => (
        <li key={p.id} className="private__row" style={{ gridTemplateColumns: '1fr auto' }}>
          <div>
            <Link to={`/requests/${p.id}`} className="private__title" style={{ color: 'var(--ink)' }}>
              {p.title}
            </Link>
            <p style={{ color: 'var(--muted)', fontSize: 13, margin: '4px 0 0', lineHeight: 1.4 }}>
              {p.body.length > 140 ? p.body.slice(0, 140) + '…' : p.body}
            </p>
          </div>
          <span className="private__when">{new Date(p.createdAt).toLocaleDateString(i18n.language)}</span>
        </li>
      ))}
    </ul>
  )
}

const KNOWN_PRAYER_ACTIONS = new Set([
  'HAIL_MARY', 'OUR_FATHER', 'GLORY_BE', 'ROSARY_DECADE', 'ROSARY_FULL',
  'I_PRAYED', 'INTERCESSION', 'GRATITUDE', 'FASTING', 'CRYING_OUT', 'PURPOSE'
])

function PrivatePrayedList({ items, loading }: { items: MyPrayerEntry[]; loading: boolean }) {
  const { t, i18n } = useTranslation()
  if (loading) {
    return <p className="private__hint">{t('common.loading')}</p>
  }
  if (items.length === 0) {
    return (
      <div className="private">
        <p className="private__hint">{t('profile.onlyYouSee')}</p>
        <p className="private__hint">{t('profile.noPrayedYet')}</p>
      </div>
    )
  }
  return (
    <div className="private">
      <p className="private__hint">{t('profile.onlyYouSee')}</p>
      <ul className="private__list">
        {items.map((p, i) => (
          <li key={`${p.requestId}-${p.createdAt}-${i}`} className="private__row">
            <span className="private__rx" style={{ background: 'oklch(0.94 0.03 220)', color: 'oklch(0.40 0.08 220)' }}>
              {KNOWN_PRAYER_ACTIONS.has(p.actionType) ? t(`prayerActions.${p.actionType}`) : p.actionType}
            </span>
            <Link to={`/requests/${p.requestId}`} className="private__title" style={{ color: 'var(--ink)' }}>
              "{p.requestTitle}"
            </Link>
            <span className="private__who">{t('profile.fromAuthor', { name: p.authorDisplayName })}</span>
            <span className="private__when">{new Date(p.createdAt).toLocaleDateString(i18n.language)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type BlockedUser = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  blockedAt: string
}

function BlockedUsersSection() {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const blocksQuery = useQuery({
    queryKey: ['blocks'],
    queryFn: async () => {
      const res = await api.get<{ items: BlockedUser[] }>('/blocks')
      return res.data.items
    }
  })

  const unblock = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/blocks/${userId}`)
    },
    onSuccess: async () => {
      toast.success(t('profile.userUnblocked'))
      await queryClient.invalidateQueries({ queryKey: ['blocks'] })
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  async function handleUnblock(user: BlockedUser) {
    const ok = await confirm({
      title: t('profile.unblockUser'),
      description: t('profile.unblockConfirm', { username: user.username }),
      confirmLabel: t('profile.unblock')
    })
    if (ok) unblock.mutate(user.userId)
  }

  return (
    <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
      <h2 className="pv-title text-xl font-semibold text-secondary">{t('profile.blockedTitle')}</h2>
      <p className="pv-muted mt-1 text-sm">
        {t('profile.blockedSub')}
      </p>
      <div className="mt-4 space-y-3">
        {blocksQuery.isLoading && (
          [0, 1].map((i) => <span key={i} className="pv-shimmer block h-12 rounded-2xl" />)
        )}
        {!blocksQuery.isLoading && (blocksQuery.data ?? []).length === 0 && (
          <p className="pv-muted rounded-2xl border border-primary bg-panel p-4 text-sm">
            {t('profile.noBlocked')}
          </p>
        )}
        {(blocksQuery.data ?? []).map((user) => (
          <article key={user.userId} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel p-4">
            <Avatar user={user} size="md" />
            <div className="min-w-0 flex-1">
              <Link to={`/u/${user.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">
                {user.displayName}
              </Link>
              <p className="pv-muted mt-1 truncate text-xs">@{user.username}</p>
              <p className="pv-muted mt-1 text-xs">{t('profile.blockedOn', { date: new Date(user.blockedAt).toLocaleDateString(i18n.language) })}</p>
            </div>
            <Button variant="secondary" disabled={unblock.isPending} onClick={() => handleUnblock(user)}>
              {t('profile.unblock')}
            </Button>
          </article>
        ))}
      </div>
    </section>
  )
}

function SessionSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const [busy, setBusy] = useState(false)

  async function onLogout() {
    setBusy(true)
    try {
      const supabase = getSupabaseClient()
      if (supabase) {
        await supabase.auth.signOut()
      }
      setAccessToken(null)
      navigate('/', { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
      <h2 className="pv-title text-lg font-semibold text-secondary">{t('profile.sessionTitle')}</h2>
      <p className="pv-muted mt-1 text-sm">{t('profile.sessionSub')}</p>
      <button
        type="button"
        onClick={onLogout}
        disabled={busy}
        className="btn btn--ghost-out mt-3"
      >
        {busy ? t('profile.signingOut') : t('shell.logout')}
      </button>
    </section>
  )
}
