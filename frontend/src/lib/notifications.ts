import i18n from '@/lib/i18n'

// Tipos e textos das notificações, compartilhados pela página /notifications,
// pelo painel do sino e pelos pedidos de amizade.

export type NotificationType =
  | 'PRAYED'
  | 'FRIEND_REQUEST_RECEIVED'
  | 'FRIEND_REQUEST_ACCEPTED'
  | 'GROUP_JOIN_APPROVED'
  | 'GROUP_JOIN_REQUESTED'
  | 'GROUP_ANNOUNCEMENT_POSTED'
  | 'REQUEST_UPDATED'
  | 'REQUEST_ANSWERED'
  | 'REQUEST_APPROVED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_CHANGES_ASKED'
  | 'MILESTONE_PRAYED'
  | 'MILESTONE_CREATED'
  | 'MILESTONE_STREAK'
  | 'VERSE_SHARE_PRAYED'

export type SubjectType = 'PRAYER_REQUEST' | 'FRIENDSHIP' | 'GROUP' | 'MILESTONE' | 'VERSE_SHARE'

export type Actor = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
}

export type Notification = {
  id: string
  type: NotificationType
  subjectType: SubjectType
  subjectId: string
  actor?: Actor | null
  payload: Record<string, unknown>
  readAt?: string | null
  createdAt: string
}

export type ListResponse = {
  items: Notification[]
}

export type Bucket = 'prayed' | 'updates' | 'follow' | 'group' | 'milestone' | 'other'

export const BUCKET_ORDER: Bucket[] = ['prayed', 'updates', 'follow', 'group', 'milestone', 'other']

export const bucketLabel = (b: Bucket): string => i18n.t(`notif.bucket.${b}`)

export function bucketOf(type: NotificationType): Bucket {
  switch (type) {
    case 'PRAYED':
    case 'VERSE_SHARE_PRAYED':
      return 'prayed'
    case 'REQUEST_UPDATED':
    case 'REQUEST_ANSWERED':
      return 'updates'
    case 'FRIEND_REQUEST_RECEIVED':
    case 'FRIEND_REQUEST_ACCEPTED':
      return 'follow'
    case 'GROUP_JOIN_APPROVED':
    case 'GROUP_JOIN_REQUESTED':
    case 'GROUP_ANNOUNCEMENT_POSTED':
      return 'group'
    case 'MILESTONE_PRAYED':
    case 'MILESTONE_CREATED':
    case 'MILESTONE_STREAK':
      return 'milestone'
    default:
      return 'other'
  }
}

export function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  if (Number.isNaN(ms)) return ''
  const sec = Math.round(ms / 1000)
  if (sec < 60) return i18n.t('time.now')
  const min = Math.round(sec / 60)
  if (min < 60) return i18n.t('time.agoMin', { count: min })
  const hr = Math.round(min / 60)
  if (hr < 24) return i18n.t('time.agoHour', { count: hr })
  const day = Math.round(hr / 24)
  if (day < 30) return i18n.t('notif.agoDay', { count: day })
  return new Date(iso).toLocaleDateString(i18n.language)
}

export function targetPath(n: Notification): string {
  switch (n.subjectType) {
    case 'PRAYER_REQUEST':
      return `/requests/${n.subjectId}`
    case 'VERSE_SHARE':
      return `/verses/${n.subjectId}`
    case 'FRIENDSHIP':
      return '/friends'
    case 'GROUP':
      return `/groups/${n.subjectId}`
    case 'MILESTONE':
      return '/profile'
    default:
      return '/feed'
  }
}

export function copyFor(n: Notification): string {
  const name = n.actor?.displayName || n.actor?.username || i18n.t('notif.someone')
  switch (n.type) {
    case 'PRAYED':
      return i18n.t('notif.prayed', { name })
    case 'VERSE_SHARE_PRAYED':
      return i18n.t('notif.verseSharePrayed', { name })
    case 'REQUEST_UPDATED':
      return i18n.t('notif.requestUpdated', { name })
    case 'REQUEST_ANSWERED':
      return i18n.t('notif.requestAnswered', { name })
    case 'MILESTONE_PRAYED': {
      const count = typeof n.payload?.count === 'number' ? (n.payload.count as number) : 0
      return count ? i18n.t('notif.milestonePrayed', { count }) : i18n.t('notif.milestonePrayedGeneric')
    }
    case 'MILESTONE_CREATED': {
      const count = typeof n.payload?.count === 'number' ? (n.payload.count as number) : 0
      return count ? i18n.t('notif.milestoneCreated', { count }) : i18n.t('notif.milestoneCreatedGeneric')
    }
    case 'MILESTONE_STREAK': {
      const days = typeof n.payload?.days === 'number' ? (n.payload.days as number) : 0
      return days ? i18n.t('notif.milestoneStreak', { count: days }) : i18n.t('notif.milestoneStreakGeneric')
    }
    case 'FRIEND_REQUEST_RECEIVED':
      return i18n.t('notif.friendRequestReceived', { name })
    case 'FRIEND_REQUEST_ACCEPTED':
      return i18n.t('notif.friendRequestAccepted', { name })
    case 'GROUP_JOIN_APPROVED':
      return i18n.t('notif.groupJoinApproved')
    case 'GROUP_JOIN_REQUESTED':
      return i18n.t('notif.groupJoinRequested', { name })
    case 'GROUP_ANNOUNCEMENT_POSTED': {
      const title = typeof n.payload?.title === 'string' ? (n.payload.title as string) : ''
      return title ? i18n.t('notif.announcementTitle', { name, title }) : i18n.t('notif.announcement', { name })
    }
    case 'REQUEST_APPROVED':
      return i18n.t('notif.requestApproved')
    case 'REQUEST_REJECTED':
      return i18n.t('notif.requestRejected')
    case 'REQUEST_CHANGES_ASKED':
      return i18n.t('notif.requestChangesAsked')
    default:
      return i18n.t('notif.newNotification')
  }
}
