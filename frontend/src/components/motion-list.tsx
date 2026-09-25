import { forwardRef, ReactNode, useRef } from 'react'
import { m } from 'motion/react'
import { baseTransition, duration, ease, stagger } from '@/lib/motion'

type MotionItemProps = {
  index?: number
  className?: string
  children: ReactNode
}

// Item de lista animado: entra escalonado pela posição, desliza para o novo
// lugar quando a lista muda (layout="position" só move, não distorce o card)
// e encolhe ao sair. Precisa de forwardRef porque AnimatePresence mode
// "popLayout" mede o filho que está saindo pelo ref.
export const MotionItem = forwardRef<HTMLDivElement, MotionItemProps>(function MotionItem(
  { index = 0, className, children },
  ref
) {
  return (
    <m.div
      ref={ref}
      layout="position"
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { ...baseTransition, delay: stagger(index) } }}
      exit={{ opacity: 0, scale: 0.98, transition: { duration: duration.fast, ease } }}
    >
      {children}
    </m.div>
  )
})

// Chave da última lista que chegou de verdade. Com keepPreviousData a query
// mostra a página antiga enquanto busca a nova; trocar a chave nesse momento
// animaria a entrada dos itens velhos. A chave só avança quando `settled`.
export function useSettledKey(key: string, settled: boolean): string {
  const ref = useRef(key)
  if (settled) {
    ref.current = key
  }
  return ref.current
}
