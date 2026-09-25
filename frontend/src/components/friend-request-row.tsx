import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Avatar } from '@/components/avatar'
import { relativeTime } from '@/lib/notifications'
import { useFriendRequestActions, type FriendRequest } from '@/lib/use-notifications'

type Props = {
  request: FriendRequest
  // Chamado ao seguir um link da linha (o painel do sino fecha).
  onNavigate?: () => void
}

// Pedido de amizade recebido com Aceitar/Recusar ali mesmo. Cada linha tem as
// próprias mutations, então o "pendente" de uma não trava as outras.
export function FriendRequestRow({ request, onNavigate }: Props) {
  const { t } = useTranslation()
  const { accept, confirmReject, pending } = useFriendRequestActions()

  return (
    <div className="req">
      <Avatar user={request} size="md" linkToProfile />
      <div className="req__body">
        <Link to={`/u/${request.username}`} className="req__name" onClick={onNavigate}>
          {request.displayName}
        </Link>
        <div className="req__meta">
          @{request.username} · {relativeTime(request.requestedAt)}
        </div>
      </div>
      <div className="req__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={pending}
          onClick={() => accept(request.id)}
        >
          {t('pubProfile.accept')}
        </button>
        <button
          type="button"
          className="btn btn--ghost-out btn--sm"
          disabled={pending}
          onClick={() => confirmReject(request)}
        >
          {t('group.reject')}
        </button>
      </div>
    </div>
  )
}
