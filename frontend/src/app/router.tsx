import { ComponentType, lazy, Suspense } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AuthPage } from '@/pages/auth-page'
import { AuthResetPage } from '@/pages/auth-reset-page'
import { PublicEntry, RequireAuth } from '@/app/route-guards'
import { FeedSkeleton } from '@/components/feed-skeleton'

// Um deploy troca o hash de todos os chunks. Uma aba que ficou aberta durante o
// deploy ainda pede os nomes antigos, e como o rewrite de SPA devolve
// index.html para qualquer caminho sem arquivo, o browser recebe HTML onde
// esperava um módulo e quebra com "'text/html' is not a valid JavaScript MIME
// type" — um erro que não diz nada ao usuário.
//
// Recarregar uma vez pega o index novo e, com ele, os nomes de chunk atuais. O
// flag em sessionStorage evita loop se o chunk estiver genuinamente quebrado:
// na segunda falha o erro sobe e aparece de verdade.
const CHUNK_RELOAD_KEY = 'creo-chunk-reload'

function retriedOnce(): boolean {
  try {
    return sessionStorage.getItem(CHUNK_RELOAD_KEY) === '1'
  } catch {
    // Modo privado ou storage bloqueado: sem memória, não tenta recarregar.
    return true
  }
}

function markRetry(value: '0' | '1') {
  try {
    if (value === '0') {
      sessionStorage.removeItem(CHUNK_RELOAD_KEY)
    } else {
      sessionStorage.setItem(CHUNK_RELOAD_KEY, '1')
    }
  } catch {
    // storage indisponível: nada a fazer.
  }
}

function lazyPage<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      const mod = await load()
      markRetry('0')
      return mod
    } catch (err) {
      if (retriedOnce()) {
        throw err
      }
      markRetry('1')
      window.location.reload()
      // Segura o Suspense enquanto a página recarrega, em vez de piscar um erro.
      return new Promise<never>(() => {})
    }
  })
}

const FeedPage = lazyPage(() => import('@/pages/feed-page').then((m) => ({ default: m.FeedPage })))
const GroupPage = lazyPage(() => import('@/pages/group-page').then((m) => ({ default: m.GroupPage })))
const GroupsPage = lazyPage(() => import('@/pages/groups-page').then((m) => ({ default: m.GroupsPage })))
const NewGroupPage = lazyPage(() => import('@/pages/new-group-page').then((m) => ({ default: m.NewGroupPage })))
const FriendsPage = lazyPage(() => import('@/pages/friends-page').then((m) => ({ default: m.FriendsPage })))
const RequestDetailPage = lazyPage(() =>
  import('@/pages/request-detail-page').then((m) => ({ default: m.RequestDetailPage }))
)
const ProfilePage = lazyPage(() => import('@/pages/profile-page').then((m) => ({ default: m.ProfilePage })))
const PublicProfilePage = lazyPage(() =>
  import('@/pages/public-profile-page').then((m) => ({ default: m.PublicProfilePage }))
)
const ModerationPage = lazyPage(() =>
  import('@/pages/moderation-page').then((m) => ({ default: m.ModerationPage }))
)
const AnnouncementPage = lazyPage(() =>
  import('@/pages/announcement-page').then((m) => ({ default: m.AnnouncementPage }))
)
const NotificationsPage = lazyPage(() =>
  import('@/pages/notifications-page').then((m) => ({ default: m.NotificationsPage }))
)
const VerseSharePage = lazyPage(() =>
  import('@/pages/verse-share-page').then((m) => ({ default: m.VerseSharePage }))
)

function lazyRoute(element: JSX.Element) {
  return (
    <Suspense fallback={<div className="mx-auto max-w-3xl px-4 py-6"><FeedSkeleton count={2} /></div>}>
      {element}
    </Suspense>
  )
}

export const router = createBrowserRouter([
  { path: '/', element: <PublicEntry /> },
  { path: '/auth', element: <AuthPage /> },
  { path: '/auth/reset', element: <AuthResetPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/feed', element: lazyRoute(<FeedPage />) },
      { path: '/groups', element: lazyRoute(<GroupsPage />) },
      { path: '/groups/new', element: lazyRoute(<NewGroupPage />) },
      { path: '/groups/:id', element: lazyRoute(<GroupPage />) },
      { path: '/groups/:id/announcements/new', element: lazyRoute(<AnnouncementPage mode="create" />) },
      { path: '/groups/:id/announcements/:aid/edit', element: lazyRoute(<AnnouncementPage mode="edit" />) },
      { path: '/friends', element: lazyRoute(<FriendsPage />) },
      { path: '/notifications', element: lazyRoute(<NotificationsPage />) },
      { path: '/requests/:id', element: lazyRoute(<RequestDetailPage />) },
      { path: '/verses/:id', element: lazyRoute(<VerseSharePage />) },
      { path: '/profile', element: lazyRoute(<ProfilePage />) },
      { path: '/u/:username', element: lazyRoute(<PublicProfilePage />) },
      { path: '/moderation', element: lazyRoute(<ModerationPage />) }
    ]
  }
])
