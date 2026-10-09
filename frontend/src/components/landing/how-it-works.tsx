import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { Avatar } from '@/components/avatar'
import { DemoRx } from '@/components/landing/demo-rx'
import { demoAuthor, demoCounts, demoPeople, healthPill } from '@/components/landing/demo-data'
import { categoryLabel } from '@/lib/categories'
import { ease, fadeUp, revealUp } from '@/lib/motion'
import { prayerActionsFor, traditionOptions } from '@/lib/traditions'

const STEPS = [1, 2, 3, 4] as const

// "Como funciona" contado pelo scroll: no desktop o mockup fica preso à
// direita e troca conforme o passo que cruza o meio da tela; abaixo de 1100px
// cada passo leva o próprio mockup (o CSS esconde um ou outro).
export function HowItWorks() {
  const { t } = useTranslation()
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLOListElement | null>(null)
  const { scrollYProgress } = useScroll({ target: listRef, offset: ['start center', 'end center'] })
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 24 })

  return (
    <section id="como-funciona" className="lp-section lp-how">
      <m.header className="lp-head" variants={revealUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
        <m.p className="lp-eyebrow" variants={fadeUp}>{t('landing.howEyebrow')}</m.p>
        <m.h2 className="lp-h2" variants={fadeUp}>{t('landing.howTitle')}</m.h2>
        <m.p className="lp-sub" variants={fadeUp}>{t('landing.howSub')}</m.p>
      </m.header>

      <div className="lp-how__grid">
        <ol className="lp-how__steps" ref={listRef}>
          <span className="lp-how__rail" aria-hidden>
            <m.span className="lp-how__rail-fill" style={{ scaleY: progress }} />
          </span>
          {STEPS.map((n, i) => (
            <m.li
              key={n}
              className={`lp-how__step ${active === i ? 'is-on' : ''}`}
              onViewportEnter={() => setActive(i)}
              viewport={{ margin: '-45% 0px -45% 0px' }}
            >
              <span className="lp-how__n">{String(n).padStart(2, '0')}</span>
              <h3 className="lp-how__title">{t(`landing.step${n}Title`)}</h3>
              <p className="lp-how__text">{t(`landing.step${n}Text`)}</p>
              <div className="lp-how__inline">
                <StepMock index={i} />
              </div>
            </m.li>
          ))}
        </ol>

        <div className="lp-how__stage" aria-hidden>
          <div className="lp-how__sticky">
            <AnimatePresence mode="wait" initial={false}>
              <m.div
                key={active}
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease } }}
                exit={{ opacity: 0, y: -12, scale: 0.98, transition: { duration: 0.18, ease } }}
              >
                <StepMock index={active} />
              </m.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  )
}

function StepMock({ index }: { index: number }) {
  if (index === 0) return <TraditionMock />
  if (index === 1) return <ComposerMock />
  if (index === 2) return <PrayedMock />
  return <AnsweredMock />
}

function MockHead() {
  const { t } = useTranslation()
  return (
    <div className="post__head">
      <Avatar user={demoAuthor} size="sm" />
      <div className="post__id">
        <div className="post__line">
          <span className="post__name">{demoAuthor.displayName}</span>
          <span className="post__sep">·</span>
          <span className="post__when">{t('landing.demoWhen')}</span>
        </div>
      </div>
    </div>
  )
}

function TraditionMock() {
  const [picked, setPicked] = useState(0)
  const reduce = useReducedMotion()
  // Alterna sozinho entre as duas tradições para mostrar que o repertório muda.
  useEffect(() => {
    if (reduce) return
    const timer = window.setInterval(() => setPicked((p) => 1 - p), 2400)
    return () => window.clearInterval(timer)
  }, [reduce])
  const options = traditionOptions()
  const actions = prayerActionsFor(options[picked].value)

  return (
    <div className="lp-mock">
      <div className="lp-mock__trads">
        {options.map((o, i) => (
          <div key={o.value} className={`opt ${picked === i ? 'is-on' : ''}`}>
            <span className="opt__mark">{o.emoji}</span>
            <span className="min-w-0">
              <span className="opt__label">{o.label}</span>
              <span className="opt__desc">{o.description}</span>
            </span>
            {picked === i && <span className="opt__check">✓</span>}
          </div>
        ))}
      </div>
      <div className="lp-mock__rx">
        <AnimatePresence mode="popLayout" initial={false}>
          {actions.map((a, i) => (
            <m.span
              key={a.type}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease, delay: i * 0.04 } }}
              exit={{ opacity: 0, transition: { duration: 0.12 } }}
            >
              <DemoRx action={a} count={0} pop={0} />
            </m.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Digita o texto aos poucos, como se alguém estivesse escrevendo agora.
function useTypewriter(text: string, speed = 32) {
  const reduce = useReducedMotion()
  const [n, setN] = useState(reduce ? text.length : 0)
  useEffect(() => {
    if (reduce) {
      setN(text.length)
      return
    }
    setN(0)
    const timer = window.setInterval(() => {
      setN((v) => {
        if (v >= text.length) {
          window.clearInterval(timer)
          return v
        }
        return v + 1
      })
    }, speed)
    return () => window.clearInterval(timer)
  }, [text, speed, reduce])
  return text.slice(0, n)
}

function ComposerMock() {
  const { t } = useTranslation()
  const title = useTypewriter(t('landing.demoTitle'))
  const visibilities = ['PUBLIC', 'GROUP_ONLY', 'PRIVATE'] as const

  return (
    <div className="lp-mock lp-mock--composer">
      <p className="lp-mock__kicker">{t('landing.mockNew')}</p>
      <div className="lp-mock__field">
        <span className="lp-mock__label">{t('landing.mockTitleLabel')}</span>
        <span className="lp-mock__input lp-mock__input--title">
          {title}
          <span className="lp-caret" />
        </span>
      </div>
      <div className="lp-mock__field">
        <span className="lp-mock__label">{t('landing.mockBodyLabel')}</span>
        <span className="lp-mock__input lp-mock__input--body">{t('landing.demoText')}</span>
      </div>
      <div className="lp-mock__field">
        <span className="lp-mock__label">{t('landing.mockVisibility')}</span>
        <div className="lp-mock__chips">
          {visibilities.map((v) => (
            <span key={v} className={`lp-chip ${v === 'GROUP_ONLY' ? 'is-on' : ''}`}>
              {t(`visibility.${v}.label`)}
            </span>
          ))}
        </div>
      </div>
      <span className="btn btn--primary lp-mock__publish">{t('landing.mockPublish')}</span>
    </div>
  )
}

function PrayedMock() {
  const { t } = useTranslation()
  const actions = prayerActionsFor('CATHOLIC')
  return (
    <div className="post lp-mock">
      <MockHead />
      <h3 className="post__title">{t('landing.demoTitle')}</h3>
      <div className="post__foot">
        <div className="post__reactions">
          {actions.slice(0, 3).map((a, i) => (
            <DemoRx key={a.type} action={a} count={demoCounts[i]} pop={0} />
          ))}
        </div>
      </div>
      <p className="lp-mock__label lp-mock__who">{t('landing.mockWhoPrayed')}</p>
      <ul className="lp-mock__people">
        {demoPeople.slice(0, 4).map((p, i) => (
          <m.li
            key={p.username}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0, transition: { duration: 0.3, ease, delay: 0.15 + i * 0.12 } }}
          >
            <Avatar user={p} size="xs" />
            <span className="lp-mock__person">{p.displayName}</span>
            <span className="lp-mock__action">{actions[i % actions.length].emoji} {actions[i % actions.length].label}</span>
          </m.li>
        ))}
      </ul>
    </div>
  )
}

function AnsweredMock() {
  const { t } = useTranslation()
  return (
    <div className="post lp-mock">
      <MockHead />
      <div className="post__line" style={{ marginBottom: 10, gap: 8 }}>
        <span className="cat-pill" style={healthPill}>{categoryLabel('HEALTH')}</span>
        <m.span
          className="lp-answered"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1, transition: { duration: 0.4, ease, delay: 0.2 } }}
        >
          ✓ {t('landing.mockAnswered')}
        </m.span>
      </div>
      <h3 className="post__title">{t('landing.demoTitle')}</h3>
      <m.blockquote
        className="lp-testimony"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease, delay: 0.4 } }}
      >
        {t('landing.mockTestimony')}
      </m.blockquote>
    </div>
  )
}
