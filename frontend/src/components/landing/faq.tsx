import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { ease, fadeUp, revealUp } from '@/lib/motion'

const QUESTIONS = [1, 2, 3, 4, 5, 6, 7, 8]

export function Faq() {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(1)
  const baseId = useId()

  return (
    <section id="duvidas" className="lp-section lp-faq">
      <m.header className="lp-head" variants={revealUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
        <m.p className="lp-eyebrow" variants={fadeUp}>{t('landing.faqEyebrow')}</m.p>
        <m.h2 className="lp-h2" variants={fadeUp}>{t('landing.faqTitle')}</m.h2>
      </m.header>

      <m.ul className="lp-faq__list" variants={revealUp} initial="hidden" whileInView="show" viewport={{ once: true, margin: '-80px' }}>
        {QUESTIONS.map((n) => {
          const isOpen = open === n
          const panelId = `${baseId}-a${n}`
          return (
            <m.li key={n} className={`lp-faq__item ${isOpen ? 'is-open' : ''}`} variants={fadeUp}>
              <button
                type="button"
                className="lp-faq__q"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? null : n)}
              >
                {t(`landing.q${n}`)}
                <span className="lp-faq__icon" aria-hidden />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <m.div
                    id={panelId}
                    className="lp-faq__a"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1, transition: { duration: 0.3, ease } }}
                    exit={{ height: 0, opacity: 0, transition: { duration: 0.22, ease } }}
                  >
                    <p>{t(`landing.a${n}`)}</p>
                  </m.div>
                )}
              </AnimatePresence>
            </m.li>
          )
        })}
      </m.ul>
    </section>
  )
}
