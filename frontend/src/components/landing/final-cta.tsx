import { useTranslation } from 'react-i18next'
import { m } from 'motion/react'
import { fadeUp, revealUp } from '@/lib/motion'

export function FinalCta({ onStart, onSignIn }: { onStart: () => void; onSignIn: () => void }) {
  const { t } = useTranslation()
  return (
    <section className="lp-cta">
      <m.div className="lp-cta__inner" variants={revealUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-60px' }}>
        <m.h2 className="lp-cta__title" variants={fadeUp} dangerouslySetInnerHTML={{ __html: t('landing.ctaTitle') }} />
        <m.p className="lp-cta__sub" variants={fadeUp}>{t('landing.ctaSub')}</m.p>
        <m.div className="lp-cta__actions" variants={fadeUp}>
          <button type="button" className="btn lp-cta__primary lp-btn-lg" onClick={onStart}>
            {t('landing.ctaPrimary')}
          </button>
          <button type="button" className="btn lp-cta__ghost lp-btn-lg" onClick={onSignIn}>
            {t('landing.signIn')}
          </button>
        </m.div>
        <m.figure className="lp-cta__quote" variants={fadeUp}>
          <blockquote>{t('landing.quote')}</blockquote>
          <figcaption>{t('landing.quoteRef')}</figcaption>
        </m.figure>
      </m.div>
    </section>
  )
}
