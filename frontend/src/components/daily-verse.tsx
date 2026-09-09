import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'
import { useVerseComposerStore } from '@/state/verse-composer-store'
import type { BibleVerse } from '@/components/feed-card'

type DailyVerseResponse = {
  verse: BibleVerse
  date: string
  alreadyShared: boolean
}

type Props = {
  /** 'side' na sidebar do shell; 'feed' no topo do mural, no mobile. */
  placement?: 'side' | 'feed'
}

/**
 * DailyVerse mostra o versículo do dia do usuário e oferece compartilhá-lo.
 *
 * A escolha é determinística por (usuário, dia) no backend, então o resultado
 * só muda à meia-noite — daí o staleTime de uma hora em vez de polling.
 */
export function DailyVerse({ placement = 'side' }: Props) {
  const { t } = useTranslation()
  const openVerseComposer = useVerseComposerStore((s) => s.openVerseComposer)

  const query = useQuery({
    queryKey: ['verse', 'today'],
    staleTime: 60 * 60_000,
    queryFn: async () => {
      const res = await api.get<DailyVerseResponse>('/verses/today')
      return res.data
    }
  })

  // O versículo é um extra: se falhar, some silenciosamente em vez de ocupar a
  // tela com um erro.
  if (query.isError) {
    return null
  }

  if (query.isLoading) {
    return (
      <div className={`daily ${placement === 'feed' ? 'daily--feed' : ''}`}>
        <div className="side__eyebrow">{t('verse.ofTheDay')}</div>
        <span className="pv-shimmer mt-2 block h-3 w-full rounded" />
        <span className="pv-shimmer mt-2 block h-3 w-4/5 rounded" />
      </div>
    )
  }

  const data = query.data
  if (!data) {
    return null
  }

  return (
    <section className={`daily ${placement === 'feed' ? 'daily--feed' : ''}`} aria-label={t('verse.ofTheDay')}>
      <div className="side__eyebrow">{t('verse.ofTheDay')}</div>
      {data.verse.text ? (
        <p className="daily__text">{data.verse.text}</p>
      ) : (
        <p className="daily__text verse__text--missing">{t('verse.textUnavailable')}</p>
      )}
      <p className="daily__ref">{data.verse.reference}</p>
      {data.alreadyShared ? (
        <p className="daily__done">{t('verse.alreadyShared')}</p>
      ) : (
        <button
          type="button"
          className="btn btn--ghost daily__cta"
          onClick={() => openVerseComposer(data.verse)}
        >
          {t('verse.shareAction')}
        </button>
      )}
    </section>
  )
}
