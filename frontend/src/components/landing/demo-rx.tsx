import { useState } from 'react'
import type { PrayerAction } from '@/lib/traditions'

// Pílula de reação das demos: mesma marcação de `.rx` no feed (feed-card.tsx),
// para a vitrine ser idêntica ao produto. `pop` muda a cada oração nova e
// dispara a animação e o burst.
export function DemoRx({
  action,
  count,
  pop,
  onPress
}: {
  action: PrayerAction
  count: number
  pop: number
  onPress?: () => void
}) {
  const [seen, setSeen] = useState(pop)
  const [bursts, setBursts] = useState<number[]>([])
  // Ajuste de estado durante o render (padrão do React para "derivar de prop
  // que mudou"): evita um efeito só para enfileirar o burst.
  if (pop !== seen) {
    setSeen(pop)
    if (pop > 0) setBursts((b) => [...b.slice(-2), pop])
  }

  const style = {
    '--rx-bg': action.bg,
    '--rx-border': action.border,
    '--rx-fg': action.fg,
    '--rx-dot': action.dot
  } as React.CSSProperties
  const className = `rx ${count > 0 ? 'rx--on' : ''}`
  const content = (
    <>
      <span className="rx__emoji" aria-hidden>
        {action.emoji}
      </span>
      <span className="rx__label">{action.label}</span>
      {count > 0 && <span className="rx__count">{count}</span>}
      {bursts.map((id) => (
        <span
          key={id}
          className="rx__burst"
          aria-hidden
          onAnimationEnd={() => setBursts((b) => b.filter((x) => x !== id))}
        >
          {action.emoji}
        </span>
      ))}
    </>
  )

  // A key muda a cada `pop` para reiniciar a animação de CSS do rxPop.
  if (!onPress) {
    return (
      <span key={pop} className={`${className} ${pop > 0 ? 'rx--pop' : ''} lp-rx-static`} style={style}>
        {content}
      </span>
    )
  }
  return (
    <button
      key={pop}
      type="button"
      onClick={onPress}
      className={`${className} ${pop > 0 ? 'rx--pop' : ''}`}
      style={style}
      aria-label={`${action.label}${count ? `, ${count}` : ''}`}
    >
      {content}
    </button>
  )
}
