// Rolagem para as âncoras da landing. Sem `behavior: 'smooth'` quando o sistema
// pede menos movimento: o CSS de reduced-motion não alcança o scroll via JS.
export function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
}
