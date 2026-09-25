import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, m } from 'motion/react'
import { Avatar } from '@/components/avatar'
import { FriendRequestRow } from '@/components/friend-request-row'
import { fadeUp } from '@/lib/motion'
import { useFriendRequests, useNotificationSummary } from '@/lib/use-notifications'

// Faixa no topo do mural quando há pedido de amizade esperando. O mural é a
// primeira tela depois do login; sem isto o pedido só existia no sino.
export function FriendRequestBanner() {
  const { t } = useTranslation()
  const summary = useNotificationSummary()
  const pending = summary.data?.friendRequests ?? 0
  const requestsQuery = useFriendRequests(pending > 0)
  const requests = pending > 0 ? requestsQuery.data ?? [] : []

  return (
    <AnimatePresence initial={false}>
      {requests.length > 0 && (
        <m.section
          key="friend-banner"
          className="frbanner"
          variants={fadeUp}
          initial="hidden"
          animate="show"
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          aria-labelledby="frbanner-h"
        >
          <h2 id="frbanner-h" className="npanel__h">
            {t('friends.received')} <span className="canvas__count">{requests.length}</span>
          </h2>
          {requests.length === 1 ? (
            <FriendRequestRow request={requests[0]} />
          ) : (
            <div className="req frbanner__many">
              <div className="frbanner__faces" aria-hidden>
                {requests.slice(0, 3).map((r) => (
                  <Avatar key={r.id} user={r} size="sm" />
                ))}
              </div>
              <div className="req__body">
                <div className="req__name">
                  {t('feed.friendRequestsMany', {
                    name: requests[0].displayName || requests[0].username,
                    count: requests.length - 1
                  })}
                </div>
              </div>
              <div className="req__actions">
                <Link to="/friends" className="btn btn--primary btn--sm">
                  {t('feed.friendRequestsSee')}
                </Link>
              </div>
            </div>
          )}
        </m.section>
      )}
    </AnimatePresence>
  )
}
