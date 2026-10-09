import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { AuthCard, type AuthTab } from '@/components/landing/auth-card'
import { ease } from '@/lib/motion'
import type { Tradition } from '@/lib/traditions'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'

// Painel de acesso da landing. Desliza da direita no desktop e ocupa a tela
// no mobile (CSS). Fica montado só enquanto aberto, mas a saída anima porque
// o AnimatePresence segura o nó até o fim da transição.
export function AuthDialog({
  tab,
  tradition,
  onClose
}: {
  tab: AuthTab | null
  tradition: Tradition | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement | null>(null)
  const open = tab !== null

  useEffect(() => {
    if (!open) return
    const returnTo = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    // Depois do primeiro frame o painel já está no DOM.
    const focusTimer = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('input')?.focus({ preventScroll: true })
    }, 60)

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab' || !panelRef.current) return
      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      window.clearTimeout(focusTimer)
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      returnTo?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {tab && (
        <m.div
          className="modal-veil lp-auth-veil"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2, ease } }}
          exit={{ opacity: 0, transition: { duration: 0.18, ease } }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <m.div
            ref={panelRef}
            className="lp-auth"
            role="dialog"
            aria-modal="true"
            aria-label={t('landing.dialogAria')}
            initial={{ x: 48, opacity: 0 }}
            animate={{ x: 0, opacity: 1, transition: { duration: 0.32, ease } }}
            exit={{ x: 48, opacity: 0, transition: { duration: 0.2, ease } }}
          >
            <div className="lp-auth__top">
              <span className="lp-brand">
                <img src="/creo-app-icon.svg" alt="" aria-hidden className="brand-mark" />
                <span className="brand-word">Creo</span>
              </span>
              <button type="button" className="lp-auth__close" onClick={onClose} aria-label={t('landing.close')}>
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
                  <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <AuthCard key={tab} initialTab={tab} initialTradition={tradition} />
            <p className="welcome__assure lp-auth__assure">
              <span className="welcome__assure-dot" aria-hidden />
              {t('landing.assure')}
            </p>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>
  )
}
