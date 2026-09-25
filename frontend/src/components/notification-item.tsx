import type { CSSProperties } from 'react'
import { Avatar } from '@/components/avatar'
import { Glyph } from '@/components/glyph'
import { prayerActionByType } from '@/lib/traditions'
import { copyFor, relativeTime, type Notification } from '@/lib/notifications'

type Props = {
  notification: Notification
  onSelect: (n: Notification) => void
  compact?: boolean
}

// Uma linha de notificação, usada na página e no painel do sino. Não lida ganha
// ponto e fundo marcados — antes a diferença era um tom de creme quase invisível.
export function NotificationItem({ notification: n, onSelect, compact }: Props) {
  const unread = !n.readAt
  const actorUser = n.actor
    ? { displayName: n.actor.displayName, username: n.actor.username, avatarUrl: n.actor.avatarUrl }
    : { displayName: '·' }
  // O tipo de oração vem no payload da reação; mostrar qual foi diz mais do
  // que "orou pelo seu pedido".
  const action =
    n.type === 'PRAYED' || n.type === 'VERSE_SHARE_PRAYED' ? prayerActionByType(n.payload?.actionType) : undefined

  return (
    <button
      type="button"
      onClick={() => onSelect(n)}
      className={`notif${compact ? ' notif--compact' : ''}${unread ? ' notif--unread' : ''}`}
    >
      <Avatar user={actorUser} size={compact ? 'sm' : 'md'} />
      <div className="notif__body">
        <div className="notif__line">{copyFor(n)}</div>
        <div className="notif__meta">
          {action && (
            <span
              className="notif__rx"
              style={{ '--rx-bg': action.bg, '--rx-border': action.border, '--rx-fg': action.fg } as CSSProperties}
            >
              <span className="notif__rx-glyph">
                <Glyph kind={action.glyph} size={11} />
              </span>
              {action.label}
            </span>
          )}
          <span className="notif__when">{relativeTime(n.createdAt)}</span>
        </div>
      </div>
      {unread && <span className="notif__dot" aria-hidden />}
    </button>
  )
}
