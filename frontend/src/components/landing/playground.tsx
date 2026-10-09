import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { Avatar } from '@/components/avatar'
import { CountUp } from '@/components/count-up'
import { DemoRx } from '@/components/landing/demo-rx'
import { demoAuthor, demoCounts, demoPeople, demoVisitor, healthPill } from '@/components/landing/demo-data'
import { categoryLabel } from '@/lib/categories'
import { ease, fadeUp, revealUp } from '@/lib/motion'
import { prayerActionsFor, traditionOptions, type Tradition } from '@/lib/traditions'

const reveal = { variants: revealUp, initial: 'hidden', whileInView: 'show', viewport: { once: true, margin: '-80px' } } as const

// "Experimente": o visitante reza de verdade (no sentido da demo) por um
// pedido fictício. Nada sai do navegador. A tradição escolhida aqui sobe para
// a página e pré-seleciona o cadastro.
export function Playground({
  tradition,
  onTradition,
  onStart
}: {
  tradition: Tradition
  onTradition: (t: Tradition) => void
  onStart: () => void
}) {
  const { t } = useTranslation()
  const actions = prayerActionsFor(tradition)
  const [mine, setMine] = useState<number[]>(() => demoCounts.map(() => 0))
  const [pops, setPops] = useState<number[]>(() => demoCounts.map(() => 0))
  const [toast, setToast] = useState<{ id: number; label: string } | null>(null)

  function pick(next: Tradition) {
    if (next === tradition) return
    onTradition(next)
    setMine(demoCounts.map(() => 0))
    setToast(null)
  }

  function pray(i: number) {
    const id = Date.now()
    setMine((c) => c.map((v, k) => (k === i ? v + 1 : v)))
    setPops((p) => p.map((v, k) => (k === i ? id : v)))
    setToast({ id, label: actions[i].label })
  }

  const prayedAny = mine.some((v) => v > 0)
  const total = demoCounts.reduce((a, b) => a + b, 0) + mine.reduce((a, b) => a + b, 0)

  return (
    <section id="experimente" className="lp-section lp-try">
      <m.div className="lp-try__copy" {...reveal}>
        <m.p className="lp-eyebrow" variants={fadeUp}>{t('landing.tryEyebrow')}</m.p>
        <m.h2 className="lp-h2" variants={fadeUp}>{t('landing.tryTitle')}</m.h2>
        <m.p className="lp-sub" variants={fadeUp}>{t('landing.trySub')}</m.p>

        <m.div className="lp-try__control" variants={fadeUp}>
          <span className="lp-label">{t('landing.tryTradition')}</span>
          <div className="lp-seg" role="group" aria-label={t('landing.tryTradition')}>
            {traditionOptions().map((o) => {
              const on = o.value === tradition
              return (
                <button key={o.value} type="button" aria-pressed={on} className={on ? 'is-on' : ''} onClick={() => pick(o.value)}>
                  {on && <m.span layoutId="lp-seg-ink" className="lp-seg__ink" transition={{ duration: 0.3, ease }} />}
                  <span className="lp-seg__label">
                    {o.emoji} {o.label}
                  </span>
                </button>
              )
            })}
          </div>
        </m.div>

        <m.div variants={fadeUp}>
          <button type="button" className="btn btn--primary lp-btn-lg" onClick={onStart}>
            {t('landing.tryCta')} →
          </button>
        </m.div>
      </m.div>

      <m.div className="lp-try__demo" {...reveal}>
        <m.article className="post lp-try__post" variants={fadeUp}>
          <div className="post__head">
            <Avatar user={demoAuthor} size="md" />
            <div className="post__id">
              <div className="post__line">
                <span className="post__name">{demoAuthor.displayName}</span>
                <span className="post__handle">@{demoAuthor.username}</span>
              </div>
              <div className="post__line post__line--meta">
                <span className="cat-pill" style={healthPill}>{categoryLabel('HEALTH')}</span>
                <span className="post__sep">·</span>
                <span className="post__when">{t('landing.demoWhen')}</span>
              </div>
            </div>
          </div>
          <h3 className="post__title">{t('landing.demoTitle')}</h3>
          <p className="post__text">{t('landing.demoText')}</p>
          <div className="post__foot">
            <m.div layout className="post__reactions" key={tradition}>
              {actions.map((a, i) => (
                <m.span
                  key={a.type}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0, transition: { duration: 0.25, ease, delay: i * 0.05 } }}
                >
                  <DemoRx action={a} count={demoCounts[i] + mine[i]} pop={pops[i]} onPress={() => pray(i)} />
                </m.span>
              ))}
            </m.div>
            <span className="post__total">
              <CountUp value={total} className="post__total-num" />
              <span className="post__total-label">{t('landing.demoPrayers')}</span>
            </span>
          </div>
          <div className="lp-demo__prayed">
            <div className="lp-stack">
              {demoPeople.slice(0, 4).map((p) => (
                <span key={p.username}>
                  <Avatar user={p} size="xs" />
                </span>
              ))}
              <AnimatePresence>
                {prayedAny && (
                  <m.span
                    key="me"
                    className="lp-stack__me"
                    initial={{ opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 22 } }}
                    exit={{ opacity: 0, scale: 0.4 }}
                  >
                    <Avatar user={{ ...demoVisitor, displayName: t('landing.tryYou') }} size="xs" />
                  </m.span>
                )}
              </AnimatePresence>
            </div>
            <span className="lp-demo__prayed-label">
              {prayedAny ? `${t('landing.tryYou')}, Ana, Pedro…` : t('landing.tryHint')}
            </span>
          </div>
        </m.article>

        <div className="lp-try__toast" aria-live="polite">
          <AnimatePresence mode="popLayout">
            {toast && (
              <m.div
                key={toast.id}
                className="lp-toast"
                initial={{ opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: 0.3, ease } }}
                exit={{ opacity: 0, y: -8, transition: { duration: 0.18, ease } }}
              >
                <span className="lp-toast__dot" />
                <span dangerouslySetInnerHTML={{ __html: t('landing.tryToast', { action: toast.label }) }} />
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </m.div>
    </section>
  )
}

type Visibility = 'PUBLIC' | 'GROUP_ONLY' | 'PRIVATE'
const VISIBILITIES: Visibility[] = ['PUBLIC', 'GROUP_ONLY', 'PRIVATE']
// Quantas camadas do diagrama enxergam o pedido: 1 = só você, 2 = + grupos,
// 3 = + comunidade.
const REACH: Record<Visibility, number> = { PRIVATE: 1, GROUP_ONLY: 2, PUBLIC: 3 }

// Posições (em % do diagrama) das pessoas em cada anel.
// O topo de cada anel fica livre para o rótulo.
const GROUP_SEATS = [
  { x: 74, y: 36 },
  { x: 50, y: 78 },
  { x: 26, y: 36 }
]
const COMMUNITY_SEATS = [
  { x: 73, y: 10 },
  { x: 96, y: 50 },
  { x: 73, y: 90 },
  { x: 27, y: 90 },
  { x: 4, y: 50 },
  { x: 27, y: 10 }
]

export function PrivacyDemo() {
  const { t } = useTranslation()
  const [vis, setVis] = useState<Visibility>('GROUP_ONLY')
  const [anon, setAnon] = useState(false)
  const reach = REACH[vis]
  const author = anon ? { displayName: t('landing.privacyAnonName'), username: 'anonimo' } : demoAuthor

  return (
    <section className="lp-section lp-privacy">
      <m.div className="lp-privacy__copy" {...reveal}>
        <m.p className="lp-eyebrow" variants={fadeUp}>{t('landing.privacyEyebrow')}</m.p>
        <m.h2 className="lp-h2" variants={fadeUp}>{t('landing.privacyTitle')}</m.h2>
        <m.p className="lp-sub" variants={fadeUp}>{t('landing.privacySub')}</m.p>

        <m.div className="lp-privacy__options" variants={fadeUp} role="group">
          {VISIBILITIES.map((v) => (
            <button key={v} type="button" aria-pressed={vis === v} className={`lp-vis ${vis === v ? 'is-on' : ''}`} onClick={() => setVis(v)}>
              <span className="lp-vis__title">{t(`visibility.${v}.label`)}</span>
              <span className="lp-vis__desc">{t(`landing.who${v}`)}</span>
            </button>
          ))}
        </m.div>

        <m.label className="lp-switch" variants={fadeUp}>
          <input type="checkbox" checked={anon} onChange={(e) => setAnon(e.target.checked)} />
          <span className="lp-switch__track" aria-hidden>
            <span className="lp-switch__thumb" />
          </span>
          <span>
            <span className="lp-switch__label">{t('landing.privacyAnon')}</span>
            <span className="lp-switch__hint">{t('landing.privacyAnonHint')}</span>
          </span>
        </m.label>
      </m.div>

      <m.div className="lp-privacy__visual" {...reveal} aria-hidden>
        <m.div className="lp-rings" variants={fadeUp}>
          <m.span className="lp-ring lp-ring--3" animate={{ opacity: reach >= 3 ? 1 : 0.35 }} />
          <m.span className="lp-ring lp-ring--2" animate={{ opacity: reach >= 2 ? 1 : 0.35 }} />
          <span className="lp-ring lp-ring--1" />

          <span className="lp-ring__label lp-ring__label--3">{t('landing.ringCommunity')}</span>
          <span className="lp-ring__label lp-ring__label--2">{t('landing.ringGroups')}</span>

          {COMMUNITY_SEATS.map((s, i) => (
            <Seat key={`c${i}`} seat={s} person={demoPeople[(i + 3) % demoPeople.length]} lit={reach >= 3} delay={i * 0.03} />
          ))}
          {GROUP_SEATS.map((s, i) => (
            <Seat key={`g${i}`} seat={s} person={demoPeople[i]} lit={reach >= 2} delay={i * 0.04} />
          ))}

          <div className="lp-ring__center">
            <AnimatePresence mode="wait" initial={false}>
              <m.span
                key={anon ? 'anon' : 'named'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1, transition: { duration: 0.25, ease } }}
                exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.15 } }}
                className="lp-ring__me"
              >
                {anon ? <span className="lp-anon">?</span> : <Avatar user={demoAuthor} size="md" />}
              </m.span>
            </AnimatePresence>
            <span className="lp-ring__you">{t('landing.ringYou')}</span>
          </div>
        </m.div>

        <m.div className="lp-privacy__card" variants={fadeUp}>
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={anon ? 'anon' : 'named'}
              className="post__line"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease } }}
              exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            >
              {anon ? <span className="lp-anon lp-anon--sm">?</span> : <Avatar user={author} size="xs" />}
              <span className="post__name">{author.displayName}</span>
              <span className="post__sep">·</span>
              <span className="lp-vis-tag">{t(`visibility.${vis}.label`)}</span>
            </m.div>
          </AnimatePresence>
          <p className="lp-privacy__title">{t('landing.demoTitle')}</p>
        </m.div>
      </m.div>
    </section>
  )
}

function Seat({
  seat,
  person,
  lit,
  delay
}: {
  seat: { x: number; y: number }
  person: { displayName: string; username: string }
  lit: boolean
  delay: number
}) {
  return (
    <m.span
      className="lp-seat"
      style={{ left: `${seat.x}%`, top: `${seat.y}%` }}
      animate={{
        opacity: lit ? 1 : 0.35,
        scale: lit ? 1 : 0.86,
        filter: lit ? 'grayscale(0)' : 'grayscale(1)',
        transition: { duration: 0.35, ease, delay }
      }}
    >
      <Avatar user={person} size="sm" />
    </m.span>
  )
}
