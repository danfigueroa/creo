import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { GroupMark } from '@/components/group-mark'
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
      <main className="canvas">
        <div className="feed__head canvas__headrow">
          <div>
            <div className="feed__eyebrow">{t('groups.eyebrow')}</div>
            <h1 className="feed__title">{t('groups.title')}</h1>
            <p className="feed__sub">{t('groups.sub')}</p>
          </div>
          <Link to="/groups/new" className="btn btn--primary">
            {t('groups.newGroup')}
          </Link>
        </div>

        {isError && (
          <p role="alert" className="canvas__alert">
            {t('groups.loadError')}
          </p>
        )}

        {isLoading && (
          <div className="group-list">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="group-card">
                <span className="pv-shimmer h-12 w-12 rounded-xl" />
                <div className="flex-1">
                  <span className="pv-shimmer block h-5 w-1/2 rounded" />
                  <span className="pv-shimmer mt-3 block h-3 w-3/4 rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="canvas__empty">
            <p className="canvas__empty-title">{t('groups.emptyTitle')}</p>
            <p className="canvas__empty-sub">{t('groups.emptySub')}</p>
            <Link to="/groups/new" className="btn btn--primary" style={{ display: 'inline-block', marginTop: 18 }}>
              {t('groups.createFirst')}
            </Link>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="group-list">
            {items.map((group, index) => (
              <MotionItem key={group.id} index={index}>
                <Link to={`/groups/${group.id}`} className="group-card">
                  <GroupMark name={group.name} imageUrl={group.imageUrl} size={48} />
                  <div className="group-card__body">
                    <div className="group-card__head">
                      <h2 className="group-card__name">{group.name}</h2>
                      <span className="policy-pill">{t(`group.policy.${group.joinPolicy}`)}</span>
                    </div>
                    {group.description && <p className="group-card__desc">{group.description}</p>}
                  </div>
                  <span className="group-card__go" aria-hidden>→</span>
                </Link>
              </MotionItem>
            ))}
          </div>
        )}
      </main>
    </PageShell>
  )
}
