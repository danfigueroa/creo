import { Link } from 'react-router-dom'
import i18n from '@/lib/i18n'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

type AvatarUser = {
  displayName?: string | null
  username?: string | null
  avatarUrl?: string | null
}

type AvatarProps = {
  user: AvatarUser
  size?: AvatarSize
  className?: string
  linkToProfile?: boolean
  ariaLabel?: string
}

const sizePx: Record<AvatarSize, number> = {
  xs: 28,
  sm: 32,
  md: 40,
  lg: 56,
  xl: 80
}

function initialOf(user: AvatarUser): string {
  const source = user.displayName || user.username || ''
  return (source[0] || 'U').toUpperCase()
}

// toneFor: deterministic 0–360 hue from a stable seed (username or displayName)
// so each user has a consistent oklch tint across renders without storing it.
function toneFor(user: AvatarUser): number {
  const seed = user.username || user.displayName || ''
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0
  }
  return ((hash % 360) + 360) % 360
}

export function Avatar({ user, size = 'sm', className, linkToProfile = false, ariaLabel }: AvatarProps) {
  const px = sizePx[size]
  const tone = toneFor(user)
  const bg = `oklch(0.92 0.03 ${tone})`
  const fg = `oklch(0.38 0.08 ${tone})`
  const styleVars = {
    width: px,
    height: px,
    fontSize: Math.round(px * 0.4),
    background: user.avatarUrl ? undefined : bg,
    color: user.avatarUrl ? undefined : fg
  } as const

  const merged = className ? `avatar ${className}` : 'avatar'

  const content = user.avatarUrl ? (
    <img
      src={user.avatarUrl}
      alt={user.displayName || user.username || ''}
      referrerPolicy="no-referrer"
    />
  ) : (
    <span>{initialOf(user)}</span>
  )

  if (linkToProfile && user.username) {
    return (
      <Link
        to={`/u/${user.username}`}
        className={merged}
        style={styleVars}
        aria-label={ariaLabel || i18n.t('avatar.viewProfileOf', { name: user.displayName || user.username })}
      >
        {content}
      </Link>
    )
  }
  return (
    <span className={merged} style={styleVars} aria-label={ariaLabel}>
      {content}
    </span>
  )
}
