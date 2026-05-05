import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/button'

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
  const [pending, setPending] = useState<Pending | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPending({ options, resolve })
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
      {pending && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          onClick={() => handleClose(false)}
        >
          <div
            className="pv-panel w-full max-w-md rounded-3xl border border-primary/20 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="confirm-dialog-title" className="pv-title text-lg text-secondary">
              {pending.options.title}
            </h2>
            {pending.options.description && (
              <p className="mt-2 text-sm pv-muted">{pending.options.description}</p>
            )}
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" type="button" onClick={() => handleClose(false)}>
                {pending.options.cancelLabel ?? 'Cancelar'}
              </Button>
              <Button
                ref={confirmButtonRef}
                type="button"
                onClick={() => handleClose(true)}
                className={pending.options.destructive ? 'bg-accent hover:bg-accent/90' : undefined}
              >
                {pending.options.confirmLabel ?? 'Confirmar'}
              </Button>
            </div>
          </div>
        </div>
      )}
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
