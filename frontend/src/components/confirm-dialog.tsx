import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { Button } from '@/components/button'
import { fade, popIn } from '@/lib/motion'

type ConfirmOptions = {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

type ConfirmContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null)

type Pending = {
  options: ConfirmOptions
  resolve: (value: boolean) => void
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<Pending | null>(null)
  // Último conteúdo exibido: `pending` vira null no clique, mas o diálogo ainda
  // está saindo e precisa do título/rótulos para não piscar vazio.
  const [shown, setShown] = useState<ConfirmOptions | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve })
      setShown(options)
    })
  }, [])

  const handleClose = useCallback(
    (result: boolean) => {
      if (pending) {
        pending.resolve(result)
        setPending(null)
      }
    },
    [pending]
  )

  useEffect(() => {
    if (!pending) {
      return
    }
    confirmButtonRef.current?.focus()
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        handleClose(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pending, handleClose])

  const value = useMemo<ConfirmContextValue>(() => ({ confirm }), [confirm])

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AnimatePresence>
      {pending && shown && (
        <m.div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={() => handleClose(false)}
          variants={fade}
          initial="hidden"
          animate="show"
          exit="exit"
        >
          <m.div
            className="pv-panel w-full max-w-md rounded-3xl border border-primary/20 p-6"
            onClick={(e) => e.stopPropagation()}
            variants={popIn}
          >
            <h2 id="confirm-dialog-title" className="pv-title text-lg text-secondary">
              {shown.title}
            </h2>
            {shown.description && (
              <p className="mt-2 text-sm pv-muted">{shown.description}</p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" type="button" onClick={() => handleClose(false)}>
                {shown.cancelLabel ?? t('common.cancel')}
              </Button>
              <Button
                ref={confirmButtonRef}
                type="button"
                onClick={() => handleClose(true)}
                className={shown.destructive ? 'bg-accent hover:bg-accent/90' : undefined}
              >
                {shown.confirmLabel ?? t('common.confirm')}
              </Button>
            </div>
          </m.div>
        </m.div>
      )}
      </AnimatePresence>
    </ConfirmContext.Provider>
  )
}

export function useConfirm(): ConfirmContextValue['confirm'] {
  const ctx = useContext(ConfirmContext)
  if (!ctx) {
    throw new Error('useConfirm deve ser usado dentro de <ConfirmDialogProvider>')
  }
  return ctx.confirm
}
