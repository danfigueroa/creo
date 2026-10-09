import type { Transition, Variants } from 'motion/react'

// Presets compartilhados de movimento. A curva é a mesma que o index.css já usa
// em .tabs__ink e nos steps (cubic-bezier(.2,.7,.2,1)), para o movimento em JS e
// em CSS parecerem da mesma família. Durações curtas de propósito: a identidade
// é editorial, o movimento acompanha e não chama atenção.
export const ease = [0.2, 0.7, 0.2, 1] as const

export const duration = {
  fast: 0.16,
  base: 0.22,
  slow: 0.32
}

export const baseTransition: Transition = { duration: duration.base, ease }

export const springSoft: Transition = { type: 'spring', stiffness: 380, damping: 34, mass: 0.8 }

// Entrada padrão de bloco: sobe 6px e aparece.
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: baseTransition },
  exit: { opacity: 0, y: -4, transition: { duration: duration.fast, ease } }
}

// Popover/menu/modal: escala de 0.98 com fade.
export const popIn: Variants = {
  hidden: { opacity: 0, scale: 0.98, y: 4 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: duration.fast, ease } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.12, ease } }
}

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: duration.base, ease } },
  exit: { opacity: 0, transition: { duration: duration.fast, ease } }
}

// Atraso de entrada escalonada. O teto evita que o 20º item de uma lista
// espere quase um segundo para aparecer.
export function stagger(index: number, step = 0.04, max = 6): number {
  return Math.min(index, max) * step
}

// Seção da landing entrando na tela: deslocamento maior que o `fadeUp` porque
// o bloco é grande, e os filhos (com `fadeUp`) seguem em cascata.
export const revealUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease, staggerChildren: 0.07, delayChildren: 0.1 } }
}
