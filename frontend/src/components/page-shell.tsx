import { PropsWithChildren, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useSessionStore } from '@/state/session-store'
import { useComposerStore } from '@/state/composer-store'
import { getSupabaseClient } from '@/lib/supabase'
import { api } from '@/lib/api'
import { NewRequestModal } from '@/components/new-request-modal'
import { Avatar } from '@/components/avatar'

type ProfileMini = {
  email: string
  username: string
  displayName: string
  avatarUrl?: string | null
}

type SearchUser = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
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

const NAV: Array<{ id: NavKind; label: string; to: string; pip?: boolean }> = [
  { id: 'mural', label: 'Mural', to: '/feed' },
  { id: 'notifs', label: 'Notificações', to: '/notifications', pip: true },
  { id: 'amigos', label: 'Amigos', to: '/friends' },
  { id: 'grupos', label: 'Grupos', to: '/groups' },
  { id: 'criar', label: 'Criar grupo', to: '/groups/new' }
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

export function PageShell({ children }: PropsWithChildren) {
  const navigate = useNavigate()
  const setAccessToken = useSessionStore((s) => s.setAccessToken)
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('')
  const [searchNotice, setSearchNotice] = useState('')
  const [requestedUsers, setRequestedUsers] = useState<Record<string, boolean>>({})
  const [requestedGroups, setRequestedGroups] = useState<Record<string, boolean>>({})
  const menuRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLDivElement | null>(null)

  const profileQuery = useQuery({
    queryKey: ['profile', 'shell'],
    queryFn: async () => (await api.get<ProfileMini>('/profile')).data
  })

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
  const openComposer = useComposerStore((s) => s.openComposer)
  const closeComposer = useComposerStore((s) => s.closeComposer)

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
      setSearchNotice('Solicitação de amizade enviada.')
    },
    onError: (err: any) => {
      const code = err?.response?.data?.error?.code
      const message = err?.response?.data?.error?.message
      if (code === 'FRIEND_REQUEST_EXISTS') {
        setSearchNotice('Vocês já têm uma solicitação pendente ou amizade ativa.')
      } else if (code === 'USER_NOT_FOUND') {
        setSearchNotice('Usuário não encontrado.')
      } else if (code === 'CANNOT_ADD_SELF') {
        setSearchNotice('Você não pode se adicionar como amigo.')
      } else if (message) {
        setSearchNotice(message)
      } else {
        setSearchNotice('Não foi possível enviar solicitação de amizade.')
      }
    }
  })

  const requestGroupJoin = useMutation({
    mutationFn: async (groupID: string) => {
      await api.post(`/groups/${groupID}/join-requests`)
    },
    onSuccess: (_data, groupID) => {
      setRequestedGroups((prev) => ({ ...prev, [groupID]: true }))
      setSearchNotice('Solicitação para entrar no grupo enviada.')
    },
    onError: () => {
      setSearchNotice('Não foi possível solicitar entrada no grupo.')
    }
  })

  const displayName = useMemo(() => {
    const profile = profileQuery.data
    if (!profile) return 'Minha conta'
    return profile.displayName || profile.email.split('@')[0] || 'Minha conta'
  }, [profileQuery.data])

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

  useEffect(() => {
    if (!searchNotice) return
    const timer = window.setTimeout(() => setSearchNotice(''), 2500)
    return () => window.clearTimeout(timer)
  }, [searchNotice])

  const friendsTop = (friendsQuery.data ?? []).slice(0, 4)

  return (
    <div className="app">
      <aside className="side">
        <Link to="/feed" className="side__brand" aria-label="Creo — ir para o início">
          <span className="brand-mark" aria-hidden>
            <span />
          </span>
          <span className="brand-word">Creo</span>
        </Link>

        <nav className="side__nav" aria-label="Menu principal">
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
              <span>{n.label}</span>
              {n.pip && unreadQuery.data && unreadQuery.data > 0 ? <span className="navitem__pip" /> : null}
            </NavLink>
          ))}
        </nav>

        <div className="side__divider" />

        {friendsTop.length > 0 && (
          <div className="side__praying">
            <div className="side__eyebrow">Em oração agora</div>
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
                Ver perfil
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="block w-full px-4 py-2.5 text-left text-sm text-[var(--ink-2)] hover:bg-[rgba(14,74,83,0.06)] hover:text-[var(--ink)]"
              >
                Sair
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="stage">
        <div className="top">
          <div className="top__search" ref={searchRef}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
              <circle cx="6" cy="6" r="4.2" stroke="currentColor" strokeWidth="1.3" />
              <line x1="9.2" y1="9.2" x2="12" y2="12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              placeholder="Buscar amigos, grupos ou intenções"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onFocus={() => setSearchOpen(true)}
            />
            <span className="top__kbd">⌘K</span>

            {searchOpen && (
              <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl border border-[var(--line-2)] bg-[var(--card)] p-3 shadow-[var(--shadow-2)]">
                {normalizedSearch.length < 2 && (
                  <p className="text-xs text-[var(--muted)]">Digite pelo menos 2 caracteres para buscar amigos e grupos.</p>
                )}

                {searchNotice && (
                  <p className="mb-2 rounded-lg border border-[var(--line-2)] bg-[var(--card-2)] px-2 py-1 text-xs text-[var(--ink-2)]">
                    {searchNotice}
                  </p>
                )}

                {normalizedSearch.length >= 2 && (
                  <div className="space-y-3">
                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Amigos</p>
                      <div className="space-y-1.5">
                        {(usersSearchQuery.data ?? []).map((user) => {
                          const alreadyRequested = requestedUsers[user.username.toLowerCase()]
                          return (
                            <div
                              key={user.userId}
                              className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-2.5 py-2"
                            >
                              <Avatar user={user} size="xs" linkToProfile />
                              <Link
                                to={`/u/${user.username}`}
                                className="min-w-0 flex-1"
                                onClick={() => setSearchOpen(false)}
                              >
                                <p className="truncate text-sm font-semibold text-[var(--ink)]">{user.displayName}</p>
                                <p className="truncate text-xs text-[var(--muted)]">@{user.username}</p>
                              </Link>
                              <button
                                className="shrink-0 rounded-full border border-[var(--line-2)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-50"
                                disabled={alreadyRequested || sendFriendRequest.isPending}
                                onClick={() => sendFriendRequest.mutate(user.username)}
                                type="button"
                              >
                                {alreadyRequested ? 'Enviado' : 'Adicionar'}
                              </button>
                            </div>
                          )
                        })}
                        {usersSearchQuery.isSuccess && (usersSearchQuery.data ?? []).length === 0 && (
                          <p className="text-xs text-[var(--muted)]">Nenhum amigo encontrado.</p>
                        )}
                      </div>
                    </div>

                    <div>
                      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--ink-3)]">Grupos</p>
                      <div className="space-y-1.5">
                        {(groupsSearchQuery.data ?? []).map((group) => {
                          const alreadyRequested = requestedGroups[group.id]
                          return (
                            <div
                              key={group.id}
                              className="flex items-center justify-between rounded-xl border border-[var(--line)] px-2.5 py-2"
                            >
                              <Link
                                to={`/groups/${group.id}`}
                                onClick={() => setSearchOpen(false)}
                                className="min-w-0 flex-1"
                              >
                                <p className="truncate text-sm font-semibold text-[var(--ink)]">{group.name}</p>
                                <p className="truncate text-xs text-[var(--muted)]">{group.joinPolicy}</p>
                              </Link>
                              <button
                                className="shrink-0 rounded-full border border-[var(--line-2)] px-2.5 py-1 text-xs font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:text-[var(--ink)] disabled:opacity-50"
                                disabled={group.isMember || alreadyRequested || requestGroupJoin.isPending}
                                onClick={() => requestGroupJoin.mutate(group.id)}
                                type="button"
                              >
                                {group.isMember ? 'No grupo' : alreadyRequested ? 'Solicitado' : 'Entrar'}
                              </button>
                            </div>
                          )
                        })}
                        {groupsSearchQuery.isSuccess && (groupsSearchQuery.data ?? []).length === 0 && (
                          <p className="text-xs text-[var(--muted)]">Nenhum grupo encontrado.</p>
                        )}
                        {groupsSearchQuery.isError && (
                          <p className="rounded-lg border border-[var(--line-2)] px-2 py-1 text-xs text-[var(--ink-2)]">
                            Não foi possível buscar grupos agora.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="top__actions">
            <button type="button" className="btn btn--ghost-out top__compose" onClick={() => openComposer()}>
              <span aria-hidden>＋</span> Nova intenção
            </button>
            <Link to="/notifications" className="iconbtn" aria-label={`Notificações${unreadQuery.data ? ` (${unreadQuery.data} não lidas)` : ''}`}>
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
      <NewRequestModal
        open={composerOpen}
        onClose={closeComposer}
        defaultGroupId={composerDefaultGroupId ?? undefined}
      />
    </div>
  )
}
