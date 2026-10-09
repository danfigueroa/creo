import { useCallback, useEffect, useState } from 'react'

// Contagem regressiva em segundos para botões de reenvio: o Supabase limita
// e-mails por hora, e um clique repetido só queimaria a cota.
export function useCooldown(seconds: number) {
  const [left, setLeft] = useState(0)

  useEffect(() => {
    if (left <= 0) return
    const timer = window.setTimeout(() => setLeft((v) => v - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [left])

  const start = useCallback(() => setLeft(seconds), [seconds])
  return { left, active: left > 0, start }
}
