import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { m } from 'motion/react'
import { Avatar } from '@/components/avatar'
import { GroupMark } from '@/components/group-mark'
import { Glyph, type GlyphKind } from '@/components/glyph'
import { demoPeople } from '@/components/landing/demo-data'
import { fadeUp, revealUp } from '@/lib/motion'

// Spotlight: o brilho do card segue o cursor via --mx/--my, sem re-render.
function onSpotlight(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

function Card({
  glyph,
  title,
  text,
  className = '',
  children
}: {
  glyph: GlyphKind
  title: string
  text: string
  className?: string
  children?: ReactNode
}) {
  return (
    <m.article className={`lp-bento__card ${className}`} variants={fadeUp} onPointerMove={onSpotlight}>
      <span className="lp-bento__mark" aria-hidden>
        <Glyph kind={glyph} size={16} color="var(--ink-2)" />
      </span>
      <h3 className="lp-bento__title">{title}</h3>
      <p className="lp-bento__text">{text}</p>
      {children && <div className="lp-bento__art" aria-hidden>{children}</div>}
    </m.article>
  )
}

export function FeatureBento() {
  const { t } = useTranslation()
  const groups = t('landing.f2Groups').split('|')

  return (
    <section id="recursos" className="lp-section">
      <m.header className="lp-head" variants={revealUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
        <m.p className="lp-eyebrow" variants={fadeUp}>{t('landing.featuresEyebrow')}</m.p>
        <m.h2 className="lp-h2" variants={fadeUp}>{t('landing.featuresTitle')}</m.h2>
      </m.header>

      <m.div
        className="lp-bento"
        variants={revealUp}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: '-80px' }}
      >
        <Card glyph="rose" title={t('landing.f1Title')} text={t('landing.f1Text')} className="lp-bento__card--wide">
          <div className="lp-timeline">
            <span className="lp-timeline__item">
              <span className="lp-timeline__dot" />
              {t('landing.demoTitle')}
            </span>
            <span className="lp-timeline__item">
              <span className="lp-timeline__dot" />
              {t('landing.step3Title')}
            </span>
            <span className="lp-timeline__item is-done">
              <span className="lp-timeline__dot" />✓ {t('landing.mockAnswered')}
            </span>
          </div>
        </Card>

        <Card glyph="ring" title={t('landing.f2Title')} text={t('landing.f2Text')}>
          <div className="lp-groups">
            {groups.map((g) => (
              <span key={g} className="lp-groups__row">
                <GroupMark name={g} size={26} />
                {g}
              </span>
            ))}
          </div>
        </Card>

        <Card glyph="beads" title={t('landing.f3Title')} text={t('landing.f3Text')}>
          <div className="lp-friends">
            {demoPeople.slice(0, 3).map((p) => (
              <span key={p.username} className="lp-friends__row">
                <Avatar user={p} size="xs" />@{p.username}
              </span>
            ))}
          </div>
        </Card>

        <Card glyph="sun" title={t('landing.f4Title')} text={t('landing.f4Text')} className="lp-bento__card--wide lp-bento__card--verse">
          <figure className="lp-bento__verse">
            <blockquote>{t('landing.demoVerseText')}</blockquote>
            <figcaption>{t('landing.demoVerseRef')}</figcaption>
          </figure>
        </Card>

        <Card glyph="diamond" title={t('landing.f5Title')} text={t('landing.f5Text')} className="lp-bento__card--half">
          <div className="lp-notifs">
            {[1, 2, 3].map((n) => (
              <span key={n} className="lp-notifs__row" style={{ ['--i' as string]: n }}>
                <span className="lp-toast__dot" />
                {t(`landing.f5Item${n}`)}
              </span>
            ))}
          </div>
        </Card>

        <Card glyph="flame" title={t('landing.f6Title')} text={t('landing.f6Text')} className="lp-bento__card--half">
          <div className="lp-langs">
            {['Rezei por você', 'I prayed for you', 'Recé por ti'].map((s) => (
              <span key={s} className="lp-langs__chip">{s}</span>
            ))}
          </div>
        </Card>
      </m.div>
    </section>
  )
}
