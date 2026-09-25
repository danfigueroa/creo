import type { BeforeSendEvent } from '@vercel/analytics/react'

// A URL crua de uma página dinâmica carrega dado pessoal (/u/fulano) ou IDs
// que espalham a mesma tela em centenas de linhas no painel da Vercel. Troca
// cada segmento dinâmico pelo nome do parâmetro da rota (o mesmo de router.tsx)
// e descarta a query string, que pode trazer ?next=/requests/<id>.
const DYNAMIC_ROUTES: Array<[RegExp, string]> = [
  [/^\/u\/[^/]+/, '/u/:username'],
  [/^\/requests\/[^/]+/, '/requests/:id'],
  [/^\/verses\/[^/]+/, '/verses/:id'],
  [/^\/groups\/(?!new$)[^/]+\/announcements\/[^/]+\/edit$/, '/groups/:id/announcements/:aid/edit'],
  [/^\/groups\/(?!new$)[^/]+/, '/groups/:id']
]

export function normalizePath(pathname: string): string {
  for (const [pattern, route] of DYNAMIC_ROUTES) {
    if (pattern.test(pathname)) return pathname.replace(pattern, route)
  }
  return pathname
}

export function anonymizeAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url)
  url.search = ''
  url.hash = ''
  url.pathname = normalizePath(url.pathname)
  return { ...event, url: url.toString() }
}
