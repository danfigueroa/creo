import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'

// Número que conta até o novo valor quando muda. No mount mostra o valor
// direto — contar do zero a cada card do feed seria ruído, não feedback.
// Escreve no DOM via ref para não re-renderizar o card a cada frame. Por isso o
// JSX só renderiza o valor inicial: se o React também atualizasse o texto, as
// duas escritas brigariam pelo mesmo nó.
// rAF à mão em vez do `animate()` do motion: para interpolar um inteiro não
// compensa puxar o animador completo para o bundle.
export function CountUp({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const previous = useRef(value)
  const reduceMotion = useReducedMotion()
  const [initial] = useState(value)

  useEffect(() => {
    const node = ref.current
    const from = previous.current
    previous.current = value
    if (!node || from === value) return
    if (reduceMotion) {
      node.textContent = String(value)
      return
    }
    const total = Math.min(200 + Math.abs(value - from) * 50, 600)
    const start = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      const t = Math.min((now - start) / total, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      node.textContent = String(Math.round(from + (value - from) * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
    })
    return () => {
      cancelAnimationFrame(frame)
      node.textContent = String(value)
    }
  }, [value, reduceMotion])

  return (
    <span ref={ref} className={className}>
      {initial}
    </span>
  )
}
