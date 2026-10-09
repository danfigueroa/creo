import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AnimatePresence,
  m,
  useInView,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform
} from 'motion/react'
import { Avatar } from '@/components/avatar'
import { CountUp } from '@/components/count-up'
import { DemoRx } from '@/components/landing/demo-rx'
import { demoAuthor, demoCounts, demoPeople, healthPill } from '@/components/landing/demo-data'
import { categoryLabel } from '@/lib/categories'
import { ease } from '@/lib/motion'
import { prayerActionsFor, type Tradition } from '@/lib/traditions'

const TICK_MS = 1700
const TOASTS = ['landing.demoToast1', 'landing.demoToast2', 'landing.demoToast3', 'landing.demoToast4']

// Pesos do sorteio de qual oração "chega": as mais comuns sobem mais, como num
// mural de verdade.
const WEIGHTS = [5, 3, 2, 1.5, 1]
function pickAction(): number {
  const total = WEIGHTS.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < WEIGHTS.length; i++) {
    r -= WEIGHTS[i]
    if (r <= 0) return i
  }
  return 0
}

// Mockup vivo do hero: um pedido recebendo orações, notificações chegando e o
// versículo do dia ao fundo. Só anima enquanto está visível, e fica parado
// (mas completo) com reduced motion.
export function HeroDemo({ tradition }: { tradition: Tradition }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement | null>(null)
  const inView = useInView(ref, { amount: 0.25 })
  const reduce = useReducedMotion()
  const actions = prayerActionsFor(tradition)

  const [counts, setCounts] = useState(demoCounts)
  const [pops, setPops] = useState(() => demoCounts.map(() => 0))
  const [toast, setToast] = useState(0)
  const [prayed, setPrayed] = useState(3)

  useEffect(() => {
    if (!inView || reduce) return
    let tick = 0
    const timer = window.setInterval(() => {
      tick++
      const i = pickAction()
      setCounts((c) => c.map((v, k) => (k === i ? v + 1 : v)))
      setPops((p) => p.map((v, k) => (k === i ? tick : v)))
      setPrayed((n) => Math.min(n + 1, demoPeople.length))
      if (tick % 2 === 0) setToast((n) => (n + 1) % TOASTS.length)
    }, TICK_MS)
    return () => window.clearInterval(timer)
  }, [inView, reduce])

  // Inclinação seguindo o mouse: ±5°, amortecida por mola.
  const px = useMotionValue(0)
  const py = useMotionValue(0)
  const rotateY = useSpring(useTransform(px, [-0.5, 0.5], [-5, 5]), { stiffness: 140, damping: 18 })
  const rotateX = useSpring(useTransform(py, [-0.5, 0.5], [4, -4]), { stiffness: 140, damping: 18 })

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (reduce || e.pointerType !== 'mouse' || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    px.set((e.clientX - r.left) / r.width - 0.5)
    py.set((e.clientY - r.top) / r.height - 0.5)
  }
  function onPointerLeave() {
    px.set(0)
    py.set(0)
  }

  const total = counts.reduce((a, b) => a + b, 0)

  return (
    <div
      ref={ref}
      className="lp-demo"
      role="img"
      aria-label={t('landing.demoAria')}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <m.div className="lp-demo__stage" style={{ rotateX, rotateY, transformPerspective: 1400 }}>
        <m.figure
          className="lp-demo__verse"
          initial={{ opacity: 0, y: 20, rotate: 0 }}
          animate={{ opacity: 1, y: 0, rotate: 4, transition: { duration: 0.6, ease, delay: 0.35 } }}
        >
          <span className="lp-demo__verse-label">{t('landing.demoVerseLabel')}</span>
          <blockquote>{t('landing.demoVerseText')}</blockquote>
          <figcaption>{t('landing.demoVerseRef')}</figcaption>
        </m.figure>

        <m.article
          className="post lp-demo__post"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0, transition: { duration: 0.6, ease, delay: 0.15 } }}
          aria-hidden
        >
          <div className="post__head">
            <Avatar user={demoAuthor} size="md" />
            <div className="post__id">
              <div className="post__line">
                <span className="post__name">{demoAuthor.displayName}</span>
                <span className="post__handle">@{demoAuthor.username}</span>
              </div>
              <div className="post__line post__line--meta">
                <span className="cat-pill" style={healthPill}>
                  {categoryLabel('HEALTH')}
                </span>
                <span className="post__sep">·</span>
                <span className="post__when">{t('landing.demoWhen')}</span>
              </div>
            </div>
          </div>
          <h3 className="post__title">{t('landing.demoTitle')}</h3>
          <p className="post__text">{t('landing.demoText')}</p>
          <div className="post__foot">
            <div className="post__reactions">
              {actions.slice(0, 3).map((action, i) => (
                <DemoRx key={action.type} action={action} count={counts[i]} pop={pops[i]} />
              ))}
            </div>
            <span className="post__total">
              <CountUp value={total} className="post__total-num" />
              <span className="post__total-label">{t('landing.demoPrayers')}</span>
            </span>
          </div>
          <div className="lp-demo__prayed">
            <div className="lp-stack">
              <AnimatePresence initial={false}>
                {demoPeople.slice(0, Math.min(prayed, 5)).map((p) => (
                  <m.span
                    key={p.username}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1, transition: { duration: 0.3, ease } }}
                  >
                    <Avatar user={p} size="xs" />
                  </m.span>
                ))}
              </AnimatePresence>
            </div>
            <span className="lp-demo__prayed-label">{t('landing.mockWhoPrayed')}</span>
          </div>
        </m.article>

        <div className="lp-demo__toasts" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <m.div
              key={toast}
              className="lp-toast"
              initial={{ opacity: 0, y: 14, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease } }}
              exit={{ opacity: 0, y: -10, scale: 0.98, transition: { duration: 0.2, ease } }}
            >
              <span className="lp-toast__dot" />
              <span dangerouslySetInnerHTML={{ __html: t(TOASTS[toast]) }} />
            </m.div>
          </AnimatePresence>
        </div>
      </m.div>
    </div>
  )
}
