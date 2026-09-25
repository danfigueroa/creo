import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { AnnouncementCardLayout, type AnnouncementFeedItem } from '@/components/feed-card'
import { api } from '@/lib/api'
import {
  ImageUploadError,
  IMAGE_ACCEPTED_MIMES,
  IMAGE_MAX_BYTES,
  uploadAnnouncementImage
} from '@/lib/supabase'

type Role = 'MEMBER' | 'MODERATOR' | 'ADMIN'
const ROLE_RANK: Record<Role, number> = { ADMIN: 3, MODERATOR: 2, MEMBER: 1 }

type GroupDetails = {
  id: string
  name: string
  myRole?: Role | null
  isMember: boolean
}

type AnnouncementResource = {
  id: string
  groupId: string
  authorId: string
  title: string
  body: string
  eventAt: string
  imageUrl?: string | null
  createdAt: string
  updatedAt: string
}

type ProfileMini = {
  id: string
  username?: string
  displayName?: string
  avatarUrl?: string | null
}

const TITLE_MIN = 3
const TITLE_MAX = 120
const BODY_MIN = 10
const BODY_MAX = 2000

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function splitDateTime(iso: string): { dateStr: string; timeStr: string } {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return { dateStr: '', timeStr: '' }
  return {
    dateStr: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    timeStr: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  }
}

export function AnnouncementPage({ mode }: { mode: 'create' | 'edit' }) {
  const { t } = useTranslation()
  const { id: groupId = '', aid = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')

  const detailsQuery = useQuery({
    queryKey: ['group', groupId, 'details'],
    enabled: !!groupId,
    queryFn: async () => (await api.get<GroupDetails>(`/groups/${groupId}`)).data
  })

  const profileQuery = useQuery({
    queryKey: ['profile', 'me'],
    queryFn: async () => (await api.get<ProfileMini>('/profile')).data
  })

  const announcementQuery = useQuery({
    queryKey: ['announcement', aid],
    enabled: mode === 'edit' && !!aid,
    queryFn: async () => {
      // No GET-by-id endpoint; fetch the group's list and find it.
      const res = await api.get<{ items: AnnouncementResource[] }>(`/groups/${groupId}/announcements`, {
        params: { limit: 100, offset: 0 }
      })
      const found = res.data.items.find((it) => it.id === aid)
      if (!found) {
        throw new Error('not-found')
      }
      return found
    }
  })

  useEffect(() => {
    if (mode === 'edit' && announcementQuery.data) {
      const a = announcementQuery.data
      setTitle(a.title)
      setBody(a.body)
      const split = splitDateTime(a.eventAt)
      setDateStr(split.dateStr)
      setTimeStr(split.timeStr)
      setImageUrl(a.imageUrl ?? null)
    }
  }, [mode, announcementQuery.data])

  const details = detailsQuery.data
  const myRole = details?.myRole ?? null
  const canManage = !!myRole && ROLE_RANK[myRole] >= ROLE_RANK.MODERATOR

  useEffect(() => {
    if (detailsQuery.data && !canManage) {
      navigate(`/groups/${groupId}`, { replace: true })
    }
  }, [detailsQuery.data, canManage, groupId, navigate])

  const upload = useMutation({
    mutationFn: async (file: File) => uploadAnnouncementImage(file, groupId),
    onSuccess: (url) => {
      setImageUrl(url)
      setPhotoError('')
    },
    onError: (err: unknown) => {
      if (err instanceof ImageUploadError) {
        setPhotoError(err.message)
      } else {
        setPhotoError(t('profile.uploadFailed'))
      }
    }
  })

  const persist = useMutation({
    mutationFn: async () => {
      // Combine date + time, treat as local, serialize as RFC3339 in UTC.
      const local = `${dateStr}T${timeStr}`
      const parsedEventAt = new Date(local)
      if (Number.isNaN(parsedEventAt.getTime())) {
        throw new Error(t('announce.invalidDate'))
      }
      const payload = {
        title: title.trim(),
        body: body.trim(),
        eventAt: parsedEventAt.toISOString(),
        imageUrl: imageUrl ?? null
      }
      if (mode === 'edit') {
        await api.patch(`/groups/${groupId}/announcements/${aid}`, payload)
      } else {
        await api.post(`/groups/${groupId}/announcements`, payload)
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['group', groupId, 'feed'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] })
      ])
      navigate(`/groups/${groupId}?tab=mural`)
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error?.message || t('announce.saveError'))
    }
  })

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    upload.mutate(file)
  }

  const trimmedTitle = title.trim()
  const trimmedBody = body.trim()
  const titleValid = trimmedTitle.length >= TITLE_MIN && trimmedTitle.length <= TITLE_MAX
  const bodyValid = trimmedBody.length >= BODY_MIN && trimmedBody.length <= BODY_MAX
  const eventValid = !!dateStr && !!timeStr
  const canSubmit = titleValid && bodyValid && eventValid && !persist.isPending && !upload.isPending

  const titleCounter = useMemo(() => `${trimmedTitle.length}/${TITLE_MAX}`, [trimmedTitle])
  const bodyCounter = useMemo(() => `${trimmedBody.length}/${BODY_MAX}`, [trimmedBody])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!titleValid) {
      setError(t('request.titleRange', { min: TITLE_MIN, max: TITLE_MAX }))
      return
    }
    if (!bodyValid) {
      setError(t('announce.bodyRange', { min: BODY_MIN, max: BODY_MAX }))
      return
    }
    if (!eventValid) {
      setError(t('announce.eventRequired'))
      return
    }
    persist.mutate()
  }

  const acceptAttr = IMAGE_ACCEPTED_MIMES.join(',')
  const maxMb = Math.round(IMAGE_MAX_BYTES / (1024 * 1024))

  // Live preview item — rendered with interactive=false in the AnnouncementCardLayout.
  const profile = profileQuery.data
  const previewEventAt = useMemo(() => {
    if (!dateStr || !timeStr) return new Date().toISOString()
    const d = new Date(`${dateStr}T${timeStr}`)
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
  }, [dateStr, timeStr])

  const previewItem: AnnouncementFeedItem = {
    kind: 'ANNOUNCEMENT',
    id: 'preview',
    groupId,
    groupName: details?.name,
    authorId: profile?.id ?? 'preview',
    authorUsername: profile?.username,
    authorDisplayName: profile?.displayName,
    authorAvatarUrl: profile?.avatarUrl ?? null,
    title: trimmedTitle || t('announce.previewTitle'),
    body: trimmedBody || t('announce.previewBody'),
    eventAt: previewEventAt,
    imageUrl,
    createdAt: new Date().toISOString()
  }

  return (
    <PageShell>
      <main className="canvas canvas--wide">
        <div className="feed__head">
          <div className="feed__eyebrow">{mode === 'edit' ? t('announce.editEyebrow') : t('announce.newEyebrow')}</div>
          <h1 className="feed__title">{mode === 'edit' ? t('announce.editTitle') : t('announce.newTitle')}</h1>
          <p className="feed__sub">
            {t('announce.sub')}
            {details?.name ? <> {t('announce.groupLabel')} <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{details.name}</strong>.</> : null}
          </p>
        </div>

        <div className="split">
          <form onSubmit={onSubmit} className="form">
            <section className="form-section">
              <h2 className="form-section__h">{t('announce.aboutEvent')}</h2>
              <div className="field">
                <div className="field__row">
                  <label htmlFor="pv-ann-title" className="field__label">{t('request.titleLabel')}</label>
                  <span className={`field__count ${trimmedTitle.length > TITLE_MAX ? 'field__count--over' : ''}`}>{titleCounter}</span>
                </div>
                <input
                  id="pv-ann-title"
                  className="field__control"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder={t('announce.titlePlaceholder')}
                  maxLength={TITLE_MAX + 20}
                />
                <p className="field__help">{t('announce.between', { min: TITLE_MIN, max: TITLE_MAX })}</p>
              </div>

              <div className="field">
                <div className="field__row">
                  <label htmlFor="pv-ann-body" className="field__label">{t('group.descriptionLabel')}</label>
                  <span className={`field__count ${trimmedBody.length > BODY_MAX ? 'field__count--over' : ''}`}>{bodyCounter}</span>
                </div>
                <textarea
                  id="pv-ann-body"
                  className="field__control"
                  style={{ minHeight: 160 }}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={t('announce.bodyPlaceholder')}
                />
                <p className="field__help">{t('announce.between', { min: BODY_MIN, max: BODY_MAX })}</p>
              </div>
            </section>

            <section className="form-section">
              <h2 className="form-section__h">{t('announce.whenLabel')}</h2>
              <div className="field">
                <div className="field__pair">
                  <input
                    type="date"
                    aria-label={t('announce.eventDate')}
                    className="field__control"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                  />
                  <input
                    type="time"
                    aria-label={t('announce.eventTime')}
                    step={300}
                    className="field__control"
                    value={timeStr}
                    onChange={(e) => setTimeStr(e.target.value)}
                  />
                </div>
                <p className="field__help">{t('announce.editLater')}</p>
              </div>
            </section>

            <section className="form-section">
              <h2 className="form-section__h">{t('announce.imageLabel')}</h2>
              <div className="field">
                <p className="field__help">{t('announce.imageHelp', { max: maxMb })}</p>
                <div className="image-drop">
                  {imageUrl ? <img src={imageUrl} alt="" referrerPolicy="no-referrer" /> : t('announce.noImage')}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={acceptAttr}
                  className="hidden"
                  onChange={onFileChange}
                  aria-label={t('announce.selectImage')}
                />
                <div className="flex flex-wrap gap-2" style={{ marginTop: 4 }}>
                  <button type="button" className="btn btn--ghost-out btn--sm" disabled={upload.isPending} onClick={() => fileInputRef.current?.click()}>
                    {upload.isPending ? t('profile.uploading') : imageUrl ? t('announce.changeImage') : t('announce.uploadImage')}
                  </button>
                  {imageUrl && (
                    <button type="button" className="btn btn--ghost btn--sm" disabled={upload.isPending} onClick={() => setImageUrl(null)}>
                      {t('profile.remove')}
                    </button>
                  )}
                </div>
                {photoError && <p role="alert" className="canvas__alert">{photoError}</p>}
              </div>
            </section>

            {error && <p role="alert" className="canvas__alert">{error}</p>}

            <div className="form-foot">
              <div className="form-foot__actions">
                <button type="button" className="btn btn--ghost-out" onClick={() => navigate(`/groups/${groupId}?tab=mural`)} disabled={persist.isPending}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
                  {persist.isPending ? t('common.saving') : mode === 'edit' ? t('profile.saveChanges') : t('announce.publish')}
                </button>
              </div>
            </div>
          </form>

          <aside className="split__aside">
            <h2 className="form-section__h">{t('announce.preview')}</h2>
            <p className="field__help">{t('announce.previewHelp')}</p>
            <AnnouncementCardLayout item={previewItem} interactive={false} />
          </aside>
        </div>
      </main>
    </PageShell>
  )
}
