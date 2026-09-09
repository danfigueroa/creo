import { PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useSessionStore } from '@/state/session-store'
import { useComposerStore } from '@/state/composer-store'
import { useVerseComposerStore } from '@/state/verse-composer-store'
import { getSupabaseClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { fromBackendLanguage, normalizeLanguage } from '@/lib/i18n'
import { searchFriendshipLabelCompact, type SearchFriendshipStatus } from '@/lib/friendship'
import { NewRequestModal } from '@/components/new-request-modal'
import { ShareVerseModal } from '@/components/share-verse-modal'
import { Avatar } from '@/components/avatar'

type ProfileMini = {
  email: string
  username: string
  displayName: string
  avatarUrl?: string | null
  language?: string | null
}

type SearchUser = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  friendshipStatus?: SearchFriendshipStatus
}

type SearchGroup = {
  id: string
  name: string
  description: string
  joinPolicy: 'OPEN' | 'REQUEST' | 'INVITE_ONLY'
  isMember: boolean
}

type MyGroup = {
  id: string
  name: string
  description: string
  joinPolicy: 'OPEN' | 'REQUEST' | 'INVITE_ONLY'
}

type Friend = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
}

type NavKind = 'mural' | 'notifs' | 'amigos' | 'grupos' | 'criar'

const NAV: Array<{ id: NavKind; labelKey: string; to: string; pip?: boolean }> = [
  { id: 'mural', labelKey: 'nav.mural', to: '/feed' },
  { id: 'notifs', labelKey: 'nav.notifications', to: '/notifications', pip: true },
  { id: 'amigos', labelKey: 'nav.friends', to: '/friends' },
  { id: 'grupos', labelKey: 'nav.groups', to: '/groups' },
  { id: 'criar', labelKey: 'nav.createGroup', to: '/groups/new' }
]

function NavIcon({ kind }: { kind: NavKind }) {
  switch (kind) {
    case 'mural':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <rect x="2.5" y="3" width="13" height="3" rx="0.6" stroke="currentColor" strokeWidth="1.4" />
          <rect x="2.5" y="8" width="13" height="3" rx="0.6" stroke="currentColor" strokeWidth="1.4" />
          <rect x="2.5" y="13" width="13" height="2" rx="0.6" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
    case 'notifs':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <path d="M4.5 13V8.5a4.5 4.5 0 0 1 9 0V13l1 1.5h-11L4.5 13Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M7.5 16a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'amigos':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="9" cy="6.5" r="2.6" stroke="currentColor" strokeWidth="1.4" />
          <path d="M3.5 14.5C4.5 12 6.6 11 9 11s4.5 1 5.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'grupos':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="6" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="12.5" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M2.5 14.5c.7-2 2-2.8 3.5-2.8s2.8.8 3.5 2.8M9 14.5c.7-2 2-2.8 3.5-2.8s2.8.8 3.5 2.8"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      )
    case 'criar':
      return (
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
          <line x1="9" y1="6" x2="9" y2="12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <line x1="6" y1="9" x2="12" y2="9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
  }
}

type SearchResultsProps = {
  term: string
  notice: string
  users?: SearchUser[]
  usersLoaded: boolean
  groups?: SearchGroup[]
  groupsLoaded: boolean
  groupsFailed: boolean
  requestedUsers: Record<string, boolean>
  requestedGroups: Record<string, boolean>
  addPending: boolean
  joinPending: boolean
  onAddFriend: (username: string) => void
  onJoinGroup: (groupID: string) => void
  onPick: () => void
}

/** Shared by the desktop dropdown and the mobile full-screen search sheet. */
function SearchResults({
  term,
  notice,
  users,
  usersLoaded,
  groups,
  groupsLoaded,
  groupsFailed,
  requestedUsers,
  requestedGroups,
  addPending,
  joinPending,
  onAddFriend,
  onJoinGroup,
  onPick
}: SearchResultsProps) {
  const { t } = useTranslation()

  return (
    <>
      {term.length < 2 && <p className="text-xs text-[var(--muted)]">{t('shell.searchHint')}</p>}

      {notice && (
        <p className="mb-2 rounded-lg border border-[var(--line-2)] bg-[var(--card-2)] px-2 py-1 text-xs text-[var(--ink-2)]">
          {notice}
        </p>
      )}

      {term.length >= 2 && (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              {t('nav.friends')}
            </p>
            <div className="space-y-1.5">
              {(users ?? []).map((user) => {
                // O estado local cobre o pedido recém-enviado, já que este
                // call site não refaz a busca depois do POST.
                const alreadyRequested = requestedUsers[user.username.toLowerCase()]
                const stateLabel = alreadyRequested
                  ? t('shell.sent')
                  : searchFriendshipLabelCompact(user.friendshipStatus)
                return (
                  <div
                    key={user.userId}
                    className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-2.5 py-2"
                  >
                    <Avatar user={user} size="xs" linkToProfile />
                    <Link to={`/u/${user.username}`} className="min-w-0 flex-1" onClick={onPick}>
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">{user.displayName}</p>
                      <p className="truncate text-xs text-[var(--muted)]">@{user.username}</p>
                    </Link>
                    {stateLabel ? (
                      <span className="shrink-0 rounded-full border border-[var(--line-2)] px-2.5 py-1 text-xs font-medium text-[var(--muted)]">
                        {stateLabel}
                      </span>
                    ) : (
                      <button
                        className="shrink-0 rounded-full border border-[var(--line-2)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-50"
                        disabled={addPending}
                        onClick={() => onAddFriend(user.username)}
                        type="button"
                      >
                        {t('shell.add')}
                      </button>
                    )}
                  </div>
                )
              })}
              {usersLoaded && (users ?? []).length === 0 && (
                <p className="text-xs text-[var(--muted)]">{t('shell.noFriendsFound')}</p>
              )}
            </div>
          </div>

          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">
              {t('nav.groups')}
            </p>
            <div className="space-y-1.5">
              {(groups ?? []).map((group) => {
                const alreadyRequested = requestedGroups[group.id]
                return (
                  <div
                    key={group.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--line)] px-2.5 py-2"
                  >
                    <Link to={`/groups/${group.id}`} onClick={onPick} className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--ink)]">{group.name}</p>
                      <p className="truncate text-xs text-[var(--muted)]">{group.joinPolicy}</p>
                    </Link>
                    <button
                      className="shrink-0 rounded-full border border-[var(--line-2)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-50"
                      disabled={group.isMember || alreadyRequested || joinPending}
                      onClick={() => onJoinGroup(group.id)}
                      type="button"
                    >
                      {group.isMember ? t('shell.inGroup') : alreadyRequested ? t('shell.requested') : t('shell.join')}
                    </button>
                  </div>
                )
              })}
              {groupsLoaded && (groups ?? []).length === 0 && (
                <p className="text-xs text-[var(--muted)]">{t('shell.noGroupsFound')}</p>
              )}
              {groupsFailed && (
                <p className="rounded-lg border border-[var(--line-2)] px-2 py-1 text-xs text-[var(--ink-2)]">
                  {t('shell.groupsSearchError')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function PageShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [searchNotice, setSearchNotice] = useState('')
  const [requestedUsers, setRequestedUsers] = useState<Record<string, boolean>>({})
  const [requestedGroups, setRequestedGroups] = useState<Record<string, boolean>>({})
  const menuRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLDivElement | null>(null)

  const profileQuery = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => (await api.get<ProfileMini>('/profile')).data
  })

  // Sync the user's saved language preference into the UI on load.
  const profileLanguage = profileQuery.data?.language
  useEffect(() => {
    if (!profileLanguage) return
    const code = fromBackendLanguage(profileLanguage)
    if (normalizeLanguage(i18n.language) !== code) {
      void i18n.changeLanguage(code)
    }
  }, [profileLanguage, i18n])

  const friendsQuery = useQuery({
    queryKey: ['friends', 'shell'],
    enabled: !!profileQuery.data,
    queryFn: async () => (await api.get<{ items: Friend[] }>('/friends')).data.items ?? []
  })

  const unreadQuery = useQuery({
    queryKey: ['notifications', 'unread-count'],
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    queryFn: async () => (await api.get<{ count: number }>('/notifications/unread-count')).data.count
  })

  const composerOpen = useComposerStore((s) => s.open)
  const composerDefaultGroupId = useComposerStore((s) => s.defaultGroupId)
  const composerOnCreated = useComposerStore((s) => s.onCreated)
  const openComposer = useComposerStore((s) => s.openComposer)
  const closeComposer = useComposerStore((s) => s.closeComposer)
  const verseComposerOpen = useVerseComposerStore((s) => s.open)
  const verseComposerVerse = useVerseComposerStore((s) => s.verse)
  const verseComposerOnShared = useVerseComposerStore((s) => s.onShared)
  const closeVerseComposer = useVerseComposerStore((s) => s.closeVerseComposer)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearchTerm(searchTerm), 250)
    return () => window.clearTimeout(timer)
  }, [searchTerm])

  const normalizedSearch = debouncedSearchTerm.trim()
  const normalizedUserSearch = normalizedSearch.replace(/^@+/, '').trim()
  const normalizedGroupSearch = normalizedUserSearch
  const canSearchUsers = normalizedUserSearch.length >= 2 && !profileQuery.isError
  const canSearchGroups = normalizedGroupSearch.length >= 2 && !profileQuery.isError

  const usersSearchQuery = useQuery({
    queryKey: ['shell-search-users', normalizedUserSearch],
    enabled: canSearchUsers,
    queryFn: async () => {
      const res = await api.get<{ items: SearchUser[] }>('/users/search', {
        params: { q: normalizedUserSearch }
      })
      return res.data.items
    }
  })

  const groupsSearchQuery = useQuery({
    queryKey: ['shell-search-groups', normalizedGroupSearch],
    enabled: canSearchGroups,
    queryFn: async () => {
      try {
        const res = await api.get<{ items: SearchGroup[] }>('/groups/search', {
          params: { q: normalizedGroupSearch }
        })
        return res.data.items
      } catch {
        const res = await api.get<{ items: MyGroup[] }>('/groups')
        const normalized = normalizedGroupSearch.toLowerCase()
        return (res.data.items ?? [])
          .filter(
            (group) =>
              group.name.toLowerCase().includes(normalized) ||
              (group.description || '').toLowerCase().includes(normalized)
          )
          .map((group) => ({
            id: group.id,
            name: group.name,
            description: group.description,
            joinPolicy: group.joinPolicy,
            isMember: true
          }))
      }
    }
  })

  const sendFriendRequest = useMutation({
    mutationFn: async (targetUsername: string) => {
      await api.post('/friends/requests', { targetUsername })
    },
    onSuccess: (_data, username) => {
      setRequestedUsers((prev) => ({ ...prev, [username.toLowerCase()]: true }))
      setSearchNotice(t('shell.friendRequestSent'))
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error?.code
      const message = err?.response?.data?.error?.message
      if (code === 'FRIEND_REQUEST_EXISTS') {
        setSearchNotice(t('shell.friendRequestExists'))
      } else if (code === 'USER_NOT_FOUND') {
        setSearchNotice(t('shell.userNotFound'))
      } else if (code === 'CANNOT_ADD_SELF') {
        setSearchNotice(t('shell.cannotAddSelf'))
      } else if (message) {
        setSearchNotice(message)
      } else {
        setSearchNotice(t('shell.friendRequestError'))
      }
    }
  })

  const requestGroupJoin = useMutation({
    mutationFn: async (groupID: string) => {
      await api.post(`/groups/${groupID}/join-requests`)
    },
    onSuccess: (_data, groupID) => {
      setRequestedGroups((prev) => ({ ...prev, [groupID]: true }))
      setSearchNotice(t('shell.groupJoinSent'))
    },
    onError: () => {
      setSearchNotice(t('shell.groupJoinError'))
    }
  })

  const displayName = useMemo(() => {
    const profile = profileQuery.data
    if (!profile) return t('shell.myAccount')
    return profile.displayName || profile.email.split('@')[0] || t('shell.myAccount')
  }, [profileQuery.data, t])

  // Everything the results list needs, minus onPick — the dropdown and the
  // mobile sheet dismiss differently.
  const searchResultProps = {
    term: normalizedSearch,
    notice: searchNotice,
    users: usersSearchQuery.data,
    usersLoaded: usersSearchQuery.isSuccess,
    groups: groupsSearchQuery.data,
    groupsLoaded: groupsSearchQuery.isSuccess,
    groupsFailed: groupsSearchQuery.isError,
    requestedUsers,
    requestedGroups,
    addPending: sendFriendRequest.isPending,
    joinPending: requestGroupJoin.isPending,
    onAddFriend: (username: string) => sendFriendRequest.mutate(username),
    onJoinGroup: (groupID: string) => requestGroupJoin.mutate(groupID)
  }

  const handle = profileQuery.data?.username ? `@${profileQuery.data.username}` : ''
  const profileForAvatar = {
    displayName,
    username: profileQuery.data?.username,
    avatarUrl: profileQuery.data?.avatarUrl
  }

  async function onLogout() {
    const supabase = getSupabaseClient()
    if (supabase) {
      await supabase.auth.signOut()
    }
    setAccessToken(null)
    navigate('/', { replace: true })
  }

  useEffect(() => {
    function onClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setMenuOpen(false)
        setSearchOpen(false)
      }
    }
    if (menuOpen || searchOpen) {
      document.addEventListener('mousedown', onClickOutside)
      document.addEventListener('keydown', onKeyDown)
    }
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, searchOpen])

  // The mobile search sheet covers the whole viewport, so it locks the page
  // behind it and closes on Escape (same pattern as NewRequestModal).
  useEffect(() => {
    if (!sheetOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setSheetOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [sheetOpen])

  useEffect(() => {
    if (!searchNotice) return
    const timer = window.setTimeout(() => setSearchNotice(''), 2500)
    return () => window.clearTimeout(timer)
  }, [searchNotice])

  const friendsTop = (friendsQuery.data ?? []).slice(0, 4)
  const hasUnread = !!unreadQuery.data && unreadQuery.data > 0

  return (
    <div className="app">
      <aside className="side">
        <Link to="/feed" className="side__brand" aria-label={t('shell.brandAria')}>
          <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
          <span className="brand-word">Creo</span>
        </Link>

        <nav className="side__nav" aria-label={t('shell.mainMenu')}>
          {NAV.map((n) => (
            <NavLink
              key={n.id}
              to={n.to}
              end={n.id === 'mural'}
              className={({ isActive }) => `navitem ${isActive ? 'is-on' : ''}`}
            >
              <span className="navitem__icon">
                <NavIcon kind={n.id} />
              </span>
              <span>{t(n.labelKey)}</span>
              {n.pip && unreadQuery.data && unreadQuery.data > 0 ? <span className="navitem__pip" /> : null}
            </NavLink>
          ))}
        </nav>

        <div className="side__divider" />

        {friendsTop.length > 0 && (
          <div className="side__praying">
            <div className="side__eyebrow">{t('shell.prayingNow')}</div>
            <ul className="praylist">
              {friendsTop.map((friend) => (
                <li key={friend.userId}>
                  <Avatar user={friend} size="xs" />
                  <Link to={`/u/${friend.username}`}>{friend.displayName || friend.username}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="side__foot" ref={menuRef}>
          <button type="button" className="side__me" onClick={() => setMenuOpen((v) => !v)}>
            <Avatar user={profileForAvatar} size="sm" />
            <span className="side__me-text">
              <span className="side__me-name">{displayName}</span>
              <span className="side__me-handle">{handle || profileQuery.data?.email || ''}</span>
            </span>
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute bottom-full left-0 right-0 z-30 mb-2 overflow-hidden rounded-xl border border-[var(--line-2)] bg-[var(--card)] shadow-[var(--shadow-2)]"
            >
              <Link
                to="/profile"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-[var(--ink-2)] hover:bg-[rgba(14,74,83,0.06)] hover:text-[var(--ink)]"
              >
                {t('shell.viewProfile')}
              </Link>
              <Link
                to="/profile?s=prefs"
                onClick={() => setMenuOpen(false)}
                className="block px-4 py-2.5 text-sm text-[var(--ink-2)] hover:bg-[rgba(14,74,83,0.06)] hover:text-[var(--ink)]"
              >
                {t('shell.language')}
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="block w-full px-4 py-2.5 text-left text-sm text-[var(--ink-2)] hover:bg-[rgba(14,74,83,0.06)] hover:text-[var(--ink)]"
              >
                {t('shell.logout')}
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="stage">
        <div className="top">
          {/* Mobile only: the sidebar that normally carries the brand is hidden. */}
          <Link to="/feed" className="top__brand" aria-label={t('shell.brandAria')}>
            <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
            <span className="brand-word">Creo</span>
          </Link>
          <div className="top__search" ref={searchRef}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
              <line x1="9.2" y1="9.2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              placeholder={t('shell.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSearchOpen(true)}
            />
            <span className="top__kbd">⌘K</span>

            {searchOpen && (
              <div className="absolute left-0 right-0 top-full z-[45] mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-[var(--line-2)] bg-[var(--card)] p-3 shadow-[var(--shadow-2)]">
                <SearchResults {...searchResultProps} onPick={() => setSearchOpen(false)} />
              </div>
            )}
          </div>

          <div className="top__actions">
            <button
              type="button"
              className="iconbtn top__searchbtn"
              onClick={() => setSheetOpen(true)}
              aria-label={t('shell.searchOpen')}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <circle cx="8" cy="8" r="5.2" stroke="currentColor" strokeWidth="1.4" />
                <line x1="11.8" y1="11.8" x2="15" y2="15" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
            <button type="button" className="btn btn--primary top__new" onClick={() => openComposer()}>
              {t('shell.newIntention')}
            </button>
            <Link to="/notifications" className="iconbtn" aria-label={unreadQuery.data ? t('shell.notificationsAriaUnread', { count: unreadQuery.data }) : t('shell.notificationsAria')}>
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
                <path d="M4.5 13V8.5a4.5 4.5 0 0 1 9 0V13l1 1.5h-11L4.5 13Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                <path d="M7.5 16a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
              {unreadQuery.data && unreadQuery.data > 0 ? <span className="iconbtn__pip" aria-hidden /> : null}
            </Link>
          </div>
        </div>

        <main>{children}</main>
      </div>

      {/* "Criar grupo" is intentionally absent: /groups already carries two CTAs
          to /groups/new, and a fifth nav slot would crowd a 320px screen. */}
      <nav className="mobile-tabbar" aria-label={t('shell.mobileNav')}>
        <NavLink to="/feed" end className={({ isActive }) => `mtab ${isActive ? 'is-on' : ''}`}>
          <span className="mtab__icon"><NavIcon kind="mural" /></span>
          <span>{t('nav.mural')}</span>
        </NavLink>
        <NavLink
          to="/notifications"
          className={({ isActive }) => `mtab ${isActive ? 'is-on' : ''}`}
          aria-label={hasUnread ? t('shell.notificationsAriaUnread', { count: unreadQuery.data }) : t('shell.notificationsAria')}
        >
          <span className="mtab__icon">
            <NavIcon kind="notifs" />
            {hasUnread ? <span className="mtab__pip" aria-hidden /> : null}
          </span>
          <span>{t('shell.tabNotifs')}</span>
        </NavLink>
        <NavLink to="/friends" className={({ isActive }) => `mtab ${isActive ? 'is-on' : ''}`}>
          <span className="mtab__icon"><NavIcon kind="amigos" /></span>
          <span>{t('nav.friends')}</span>
        </NavLink>
        <NavLink to="/groups" className={({ isActive }) => `mtab ${isActive ? 'is-on' : ''}`}>
          <span className="mtab__icon"><NavIcon kind="grupos" /></span>
          <span>{t('nav.groups')}</span>
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => `mtab ${isActive ? 'is-on' : ''}`}>
          <span className="mtab__icon">
            <Avatar user={profileForAvatar} size="xs" />
          </span>
          <span>{t('shell.profile')}</span>
        </NavLink>
      </nav>

      {/* Mobile counterpart of the topbar's "Nova intenção" button, which scrolls
          away with the bar. Hidden above 900px by CSS. */}
      <button type="button" className="fab" onClick={() => openComposer()} aria-label={t('shell.newIntention')}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
          <line x1="12" y1="6" x2="12" y2="18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <line x1="6" y1="12" x2="18" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>

      {sheetOpen && (
        <div className="searchsheet" role="dialog" aria-modal="true" aria-label={t('shell.searchPlaceholder')}>
          <div className="searchsheet__head">
            <button
              type="button"
              className="searchsheet__back"
              onClick={() => setSheetOpen(false)}
              aria-label={t('shell.searchClose')}
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                <path d="M12 5l-5 5 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <div className="searchsheet__field">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
                <line x1="9.2" y1="9.2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
              <input
                autoFocus
                placeholder={t('shell.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="searchsheet__body">
            <SearchResults {...searchResultProps} onPick={() => setSheetOpen(false)} />
          </div>
        </div>
      )}

      <NewRequestModal
        open={composerOpen}
        onClose={closeComposer}
        defaultGroupId={composerDefaultGroupId ?? undefined}
        onCreated={composerOnCreated ?? undefined}
      />
      <ShareVerseModal
        open={verseComposerOpen}
        verse={verseComposerVerse}
        onClose={closeVerseComposer}
        onShared={verseComposerOnShared ?? undefined}
      />
    </div>
  )
}
