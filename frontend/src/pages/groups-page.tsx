import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { MotionItem } from '@/components/motion-list'

type JoinPolicy = 'OPEN' | 'REQUEST' | 'INVITE_ONLY'

type Group = {
  id: string
  name: string
  description: string
  imageUrl?: string | null
  joinPolicy: JoinPolicy
}

export function GroupsPage() {
  const { t } = useTranslation()
  const groupsQuery = useQuery({
    queryKey: ['groups', 'mine'],
    queryFn: async () => {
      const res = await api.get<{ items: Group[] }>('/groups')
      return res.data.items
    }
  })

  const items = groupsQuery.data ?? []
  const isLoading = groupsQuery.isLoading
  const isError = groupsQuery.isError

  return (
    <PageShell>
      <section className="pv-panel rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('groups.eyebrow')}</p>
            <h1 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">{t('groups.title')}</h1>
            <p className="pv-muted mt-2 max-w-2xl text-sm">
              {t('groups.sub')}
            </p>
          </div>
          <Link to="/groups/new" className="shrink-0">
            <Button className="w-full sm:w-auto">{t('groups.newGroup')}</Button>
          </Link>
        </div>
      </section>

      <section className="mt-5">
        {isError && (
          <p className="rounded-2xl border border-primary bg-panel p-4 text-sm text-primary">
            {t('groups.loadError')}
          </p>
        )}

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="pv-panel rounded-2xl p-5">
                <span className="pv-shimmer block h-5 w-1/2 rounded" />
                <span className="pv-shimmer mt-3 block h-3 w-3/4 rounded" />
                <span className="pv-shimmer mt-2 block h-3 w-2/3 rounded" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="pv-panel flex flex-col items-start gap-3 rounded-3xl p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('groups.emptyEyebrow')}</p>
            <h2 className="pv-title text-xl font-semibold text-secondary sm:text-2xl">{t('groups.emptyTitle')}</h2>
            <p className="pv-muted max-w-xl text-sm">
              {t('groups.emptySub')}
            </p>
            <Link to="/groups/new">
              <Button>{t('groups.createFirst')}</Button>
            </Link>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((group, index) => {
              const initials = group.name.slice(0, 2).toUpperCase()
              return (
                <MotionItem key={group.id} index={index}>
                  <Link
                    to={`/groups/${group.id}`}
                    className="pv-panel group flex h-full flex-col gap-3 rounded-2xl p-5 transition hover:border-primary"
                  >
                    <div className="flex items-start gap-3">
                      {group.imageUrl ? (
                        <img
                          src={group.imageUrl}
                          alt=""
                          className="h-11 w-11 shrink-0 rounded-2xl border-2 border-primary object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-primary bg-bg text-sm font-bold text-primary">
                          {initials}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate text-base font-semibold text-secondary">{group.name}</h3>
                        <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                          {t(`group.policy.${group.joinPolicy}`)}
                        </p>
                      </div>
                    </div>
                    {group.description && (
                      <p className="pv-muted text-sm leading-relaxed line-clamp-3">{group.description}</p>
                    )}
                    <p className="mt-auto text-[11px] font-semibold uppercase tracking-[0.16em] text-primary opacity-0 transition group-hover:opacity-100">
                      {t('groups.openGroup')} →
                    </p>
                  </Link>
                </MotionItem>
              )
            })}
          </div>
        )}
      </section>
    </PageShell>
  )
}
