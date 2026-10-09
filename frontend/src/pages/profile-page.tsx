import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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
import { Tradition, traditionLabel, traditionOptions } from '@/lib/traditions'
import { LANGUAGES, type BackendLanguage } from '@/lib/i18n'
import { useLanguage } from '@/lib/use-language'
import { AvatarUploadError, AVATAR_MAX_BYTES, AVATAR_ACCEPTED_MIMES, getSupabaseClient, uploadAvatar } from '@/lib/supabase'
import { useSessionStore } from '@/state/session-store'
import { ChangeEmailSection, ChangePasswordSection, DataExportSection, DeleteAccountSection } from '@/components/account-security'

const BIO_MAX = 280

type Profile = {
  id: string
  username: string
  displayName: string
  avatarUrl?: string | null
  bio?: string | null
  tradition: Tradition
  language?: BackendLanguage
}

type ProfileStats = {
  requestsCreated: number
  prayerActionsTotal: number
  prayerActionsReceived: number
  streakDays: number
}

const SECTIONS = ['atividade', 'perfil', 'prefs', 'conta'] as const
type Section = (typeof SECTIONS)[number]

const SECTION_NAV: Array<{ id: Section; labelKey: string }> = [
  { id: 'atividade', labelKey: 'profile.navActivity' },
  { id: 'perfil', labelKey: 'profile.navEdit' },
  { id: 'prefs', labelKey: 'profile.navPrefs' },
  { id: 'conta', labelKey: 'profile.navAccount' }
]

function isSection(value: string | null): value is Section {
  return value !== null && (SECTIONS as readonly string[]).includes(value)
}

export function ProfilePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { current: currentLanguage } = useLanguage()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [error, setError] = useState('')
  const [avatarStatus, setAvatarStatus] = useState('')
  const [avatarError, setAvatarError] = useState('')

  const section: Section = isSection(searchParams.get('s')) ? (searchParams.get('s') as Section) : 'atividade'

  function goTo(next: Section) {
    // 'atividade' é o default, então sai da URL para manter /profile limpo.
    setSearchParams(next === 'atividade' ? {} : { s: next }, { replace: true })
  }

  // Compat: /profile#idioma era o atalho do menu do shell antes das seções.
  useEffect(() => {
    if (location.hash === '#idioma') {
      setSearchParams({ s: 'prefs' }, { replace: true })
    }
  }, [location.hash, setSearchParams])

  const profile = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => {
      const res = await api.get<Profile>('/profile')
      return res.data
    }
  })

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
    // Todas as telas compartilham a key ['profile', 'me'] — uma invalidação basta.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['profile', 'me'] }),
      queryClient.invalidateQueries({ queryKey: ['profile', 'public'] })
    ])
  }

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
      toast.success(t('profile.profileUpdated'))
      await invalidateProfileEverywhere()
    },
    onError: (err: any) => {
      if (err?.response?.status === 401) {
        setError(t('profile.sessionExpired'))
        return
      }
      setError(err?.response?.data?.error?.message || err?.message || t('profile.saveError'))
    }
  })

  const updateAvatar = useMutation({
    mutationFn: async (avatarUrl: string | null) => {
      const saved = profile.data
      if (!saved) throw new Error(t('profile.notLoaded'))
      // PATCH /profile exige displayName e username no corpo, mas quem manda
      // aqui são os valores JÁ SALVOS: enviar o estado do formulário faria uma
      // troca de foto persistir edições que o usuário ainda não confirmou.
      const res = await api.patch<Profile>('/profile', {
        displayName: saved.displayName,
        username: saved.username,
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
  const activeLanguage = LANGUAGES.find((lang) => lang.code === currentLanguage) ?? LANGUAGES[0]
  const loading = profile.isLoading && !profile.data

  return (
    <PageShell>
      <main className="profile">
        <div className="profile__cover" />
        <div className="profile__head">
          <Avatar user={previewUser} size="xl" />
          <div className="profile__idblock">
            {loading ? (
              <>
                <span className="pv-shimmer mb-2 block h-8 w-56 rounded" />
                <span className="pv-shimmer block h-4 w-32 rounded" />
              </>
            ) : (
              <>
                <h1 className="profile__name">{displayName || profile.data?.displayName || t('profile.yourProfile')}</h1>
                <div className="profile__meta">
                  <span>@{username || profile.data?.username || 'username'}</span>
                </div>
                {profile.data?.bio && <p className="profile__bio">"{profile.data.bio}"</p>}
                {/* Estado atual de tradição e idioma direto no header — antes só
                    dava para descobrir rolando até o fim da página. */}
                <div className="profile__chips">
                  {profile.data?.tradition && (
                    <button
                      type="button"
                      className="profile__chip"
                      onClick={() => goTo('prefs')}
                      aria-label={t('profile.changeTradition')}
                    >
                      <span aria-hidden>{profile.data.tradition === 'EVANGELICAL' ? '🕊️' : '📿'}</span>
                      {traditionLabel(profile.data.tradition)}
                    </button>
                  )}
                  <button
                    type="button"
                    className="profile__chip"
                    onClick={() => goTo('prefs')}
                    aria-label={t('profile.changeLanguage')}
                  >
                    <span aria-hidden>{activeLanguage.flag}</span>
                    {activeLanguage.nativeLabel}
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="profile__actions">
            <button type="button" className="btn btn--ghost-out" onClick={() => goTo('perfil')}>
              {t('profile.editProfile')}
            </button>
          </div>
        </div>

        <nav className="pnav" role="tablist" aria-label={t('profile.yourProfile')}>
          {SECTION_NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={section === item.id}
              className={`pnav__item ${section === item.id ? 'is-on' : ''}`}
              onClick={() => goTo(item.id)}
            >
              {t(item.labelKey)}
            </button>
          ))}
        </nav>

        {section === 'atividade' && (
          <>
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
          </>
        )}

        {section === 'perfil' && (
          <>
            <section className="pcard">
              <h2 className="pcard__title">{t('profile.photoTitle')}</h2>
              <p className="pcard__sub">{t('profile.photoSub', { max: maxMb })}</p>
              <div className="pcard__body pcard__row">
                <Avatar user={previewUser} size="xl" />
                <div className="pcard__btns">
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
                    {uploadMutation.isPending
                      ? t('profile.uploading')
                      : profile.data?.avatarUrl
                        ? t('profile.changePhoto')
                        : t('profile.uploadPhoto')}
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
                    >
                      {t('profile.remove')}
                    </button>
                  )}
                </div>
              </div>
              {(avatarStatus || avatarError) && (
                <p
                  role={avatarError ? 'alert' : 'status'}
                  className={`formnote ${avatarError ? 'formnote--err' : ''}`}
                  style={{ marginTop: 16 }}
                >
                  {avatarError || avatarStatus}
                </p>
              )}
            </section>

            <form className="pcard" onSubmit={onSubmit}>
              <h2 className="pcard__title">{t('profile.accountTitle')}</h2>
              <p className="pcard__sub">{t('profile.accountSub')}</p>

              <div className="pcard__body">
                <label className="field">
                  <span className="field__label">{t('authPage.displayName')}</span>
                  <Input
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder={t('profile.displayNamePlaceholder')}
                    value={displayName}
                  />
                  <span className="field__hint">{t('profile.displayNameHelp')}</span>
                </label>

                <label className="field">
                  <span className="field__label">@username</span>
                  <Input
                    onChange={(e) => setUsername(e.target.value.replace(/@/g, '').toLowerCase())}
                    placeholder="seu_username"
                    value={username}
                  />
                  <span className="field__hint">{t('profile.usernameHelp')}</span>
                </label>

                <label className="field">
                  <span className="field__label">
                    <span>Bio</span>
                    <span className={`field__count ${bioCount > BIO_MAX ? 'is-over' : ''}`}>
                      {bioCount}/{BIO_MAX}
                    </span>
                  </span>
                  <TextArea
                    onChange={(e) => setBio(e.target.value)}
                    placeholder={t('profile.bioPlaceholder')}
                    value={bio}
                  />
                  <span className="field__hint">{t('profile.bioHelp')}</span>
                </label>
              </div>

              {error && (
                <p role="alert" className="formnote formnote--err" style={{ marginTop: 16 }}>
                  {error}
                </p>
              )}

              <div className="pcard__foot">
                <Button disabled={saveProfile.isPending} type="submit">
                  {saveProfile.isPending ? t('common.saving') : t('profile.saveChanges')}
                </Button>
              </div>
            </form>
          </>
        )}

        {section === 'prefs' && <PreferencesSection tradition={profile.data?.tradition} />}

        {section === 'conta' && (
          <>
            <ChangePasswordSection />
            <ChangeEmailSection />
            <SessionSection />
            <BlockedUsersSection />
            <DataExportSection />
            <DeleteAccountSection username={profile.data?.username} />
          </>
        )}
      </main>
    </PageShell>
  )
}

function PreferencesSection({ tradition }: { tradition?: Tradition }) {
  const { t } = useTranslation()
  const toast = useToast()
  const queryClient = useQueryClient()
  const { current: currentLanguage, change: changeLanguage, isSaving } = useLanguage()

  const traditionMutation = useMutation({
    mutationFn: async (next: Tradition) => {
      const res = await api.patch<Profile>('/profile/tradition', { tradition: next })
      return res.data
    },
    onSuccess: async () => {
      toast.success(t('profile.traditionUpdated'))
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile', 'me'] }),
        queryClient.invalidateQueries({ queryKey: ['profile', 'public'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] })
      ])
    },
    onError: () => toast.error(t('profile.traditionError'))
  })

  return (
    <>
      <section className="pcard">
        <p className="pcard__eyebrow">{t('profile.traditionEyebrow')}</p>
        <h2 className="pcard__title">{t('profile.traditionTitle')}</h2>
        <p className="pcard__sub">{t('profile.traditionSub')}</p>

        <div className="pcard__body optgrid">
          {traditionOptions().map((option) => {
            const active = tradition === option.value
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={active}
                disabled={traditionMutation.isPending || active}
                onClick={() => traditionMutation.mutate(option.value)}
                className={`opt ${active ? 'is-on' : ''}`}
              >
                <span className="opt__mark" aria-hidden>{option.emoji}</span>
                <span className="min-w-0">
                  <span className="opt__label">{option.label}</span>
                  <span className="opt__desc">{option.description}</span>
                </span>
                {active && <span className="opt__check" aria-hidden>✓</span>}
              </button>
            )
          })}
        </div>
      </section>

      <section className="pcard">
        <p className="pcard__eyebrow">{t('profile.languageEyebrow')}</p>
        <h2 className="pcard__title">{t('profile.languageTitle')}</h2>
        <p className="pcard__sub">{t('profile.languageSub')}</p>

        <div className="pcard__body optgrid">
          {LANGUAGES.map((lang) => {
            const active = currentLanguage === lang.code
            return (
              <button
                key={lang.code}
                type="button"
                aria-pressed={active}
                disabled={isSaving || active}
                onClick={() => changeLanguage(lang.code)}
                className={`opt ${active ? 'is-on' : ''}`}
              >
                <span className="opt__mark" aria-hidden>{lang.flag}</span>
                <span className="min-w-0">
                  <span className="opt__label">{lang.nativeLabel}</span>
                </span>
                {active && <span className="opt__check" aria-hidden>✓</span>}
              </button>
            )
          })}
        </div>
      </section>
    </>
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
    <section className="pcard">
      <h2 className="pcard__title">{t('profile.blockedTitle')}</h2>
      <p className="pcard__sub">{t('profile.blockedSub')}</p>

      <div className="pcard__body pcard__list">
        {blocksQuery.isLoading && [0, 1].map((i) => <span key={i} className="pv-shimmer block h-14 rounded-[10px]" />)}
        {!blocksQuery.isLoading && (blocksQuery.data ?? []).length === 0 && (
          <p className="private__hint" style={{ margin: 0 }}>{t('profile.noBlocked')}</p>
        )}
        {(blocksQuery.data ?? []).map((user) => (
          <article key={user.userId} className="pcard__item">
            <Avatar user={user} size="md" />
            <div className="pcard__item-body">
              <Link to={`/u/${user.username}`} className="private__title">
                {user.displayName}
              </Link>
              <p className="private__who" style={{ margin: '2px 0 0' }}>@{user.username}</p>
              <p className="private__when" style={{ margin: '2px 0 0' }}>
                {t('profile.blockedOn', { date: new Date(user.blockedAt).toLocaleDateString(i18n.language) })}
              </p>
            </div>
            <button
              type="button"
              className="btn btn--ghost-out"
              disabled={unblock.isPending}
              onClick={() => handleUnblock(user)}
            >
              {t('profile.unblock')}
            </button>
          </article>
        ))}
      </div>
    </section>
  )
}

function SessionSection() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const confirm = useConfirm()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const [busy, setBusy] = useState<'local' | 'global' | null>(null)

  // global encerra também os outros dispositivos (revoga os refresh tokens no
  // Supabase); os access tokens já emitidos morrem no vencimento, em até 1 h.
  async function onLogout(scope: 'local' | 'global') {
    if (scope === 'global') {
      const ok = await confirm({
        title: t('security.signOutAllTitle'),
        description: t('security.signOutAllConfirm'),
        confirmLabel: t('security.signOutAll')
      })
      if (!ok) return
    }
    setBusy(scope)
    try {
      const supabase = getSupabaseClient()
      if (supabase) {
        await supabase.auth.signOut({ scope }).catch(() => undefined)
      }
      setAccessToken(null)
      navigate('/', { replace: true })
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="pcard">
      <h2 className="pcard__title">{t('profile.sessionTitle')}</h2>
      <p className="pcard__sub">{t('security.sessionSub')}</p>
      <div className="pcard__body pcard__btns">
        <button type="button" onClick={() => onLogout('local')} disabled={busy !== null} className="btn btn--ghost-out">
          {busy === 'local' ? t('profile.signingOut') : t('shell.logout')}
        </button>
        <button type="button" onClick={() => onLogout('global')} disabled={busy !== null} className="btn btn--ghost-out">
          {busy === 'global' ? t('profile.signingOut') : t('security.signOutAll')}
        </button>
      </div>
    </section>
  )
}
