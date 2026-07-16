import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/input'
import { TextArea } from '@/components/text-area'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import { prayerCategoryOptions, type PrayerCategory } from '@/lib/categories'

type Visibility = 'GROUP_ONLY' | 'PRIVATE' | 'PUBLIC'

type Props = {
  open: boolean
  onClose: () => void
  onCreated?: (visibility: Visibility) => void
  defaultGroupId?: string
}

const TITLE_MIN = 3
const TITLE_MAX = 120
const BODY_MIN = 10
const BODY_MAX = 4000

const VISIBILITY_MARKS: Record<Visibility, string> = {
  GROUP_ONLY: 'GR',
  PUBLIC: 'PU',
  PRIVATE: 'PR'
}

const VISIBILITY_ORDER: Visibility[] = ['GROUP_ONLY', 'PUBLIC', 'PRIVATE']

export function NewRequestModal({ open, onClose, onCreated, defaultGroupId }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const categoryOptions = prayerCategoryOptions()
  const visibilityOptions = VISIBILITY_ORDER.map((value) => ({
    value,
    mark: VISIBILITY_MARKS[value],
    label: t(`visibility.${value}.label`),
    description: t(`visibility.${value}.description`)
  }))
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [category, setCategory] = useState<PrayerCategory>('OTHER')
  const [visibility, setVisibility] = useState<Visibility>('GROUP_ONLY')
  const [groupIds, setGroupIds] = useState<string[]>(defaultGroupId ? [defaultGroupId] : [])
  const [allowAnonymous, setAllowAnonymous] = useState(false)
  const [error, setError] = useState('')
  const titleInputRef = useRef<HTMLInputElement | null>(null)

  const groups = useQuery({
    queryKey: ['groups', 'mine', 'for-request'],
    enabled: open,
    queryFn: async () => {
      const res = await api.get<{ items: Array<{ id: string; name: string }> }>('/groups')
      return res.data.items
    }
  })

  const createMutation = useMutation({
    mutationFn: async () => {
      await api.post('/requests', {
        title,
        body,
        category,
        visibility,
        allowAnonymous,
        groupIds: visibility === 'GROUP_ONLY' ? groupIds : []
      })
    },
    onSuccess: async () => {
      setError('')
      const targetGroupIds = visibility === 'GROUP_ONLY' ? groupIds : []
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        ...targetGroupIds.map((gid) =>
          queryClient.invalidateQueries({ queryKey: ['group', gid, 'feed'] })
        )
      ])
      onCreated?.(visibility)
      onClose()
    },
    onError: (err: any) => {
      if (err?.response?.status === 401) {
        setError(t('request.errorSessionExpired'))
        return
      }
      if (!err?.response) {
        setError(t('request.errorBackendDown'))
        return
      }
      setError(err?.response?.data?.error?.message || t('request.errorCreate'))
    }
  })

  const titleValid = title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX
  const bodyValid = body.trim().length >= BODY_MIN && body.trim().length <= BODY_MAX
  const groupsValid = visibility !== 'GROUP_ONLY' || groupIds.length > 0
  const canSubmit = titleValid && bodyValid && groupsValid && !createMutation.isPending

  const myGroups = groups.data ?? []
  const hasGroups = myGroups.length > 0

  const titleCounter = useMemo(() => `${title.trim().length}/${TITLE_MAX}`, [title])
  const bodyCounter = useMemo(() => `${body.trim().length}/${BODY_MAX}`, [body])

  useEffect(() => {
    if (!open) {
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      titleInputRef.current?.focus()
    }, 50)
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !createMutation.isPending) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(focusTimer)
    }
  }, [open, createMutation.isPending, onClose])

  if (!open) {
    return null
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!titleValid) {
      setError(t('request.titleRange', { min: TITLE_MIN, max: TITLE_MAX }))
      return
    }
    if (!bodyValid) {
      setError(t('request.bodyRange', { min: BODY_MIN, max: BODY_MAX }))
      return
    }
    if (visibility === 'GROUP_ONLY' && groupIds.length === 0) {
      setError(t('request.selectGroup'))
      return
    }
    createMutation.mutate()
  }

  function handleBackdropClick() {
    if (createMutation.isPending) {
      return
    }
    onClose()
  }

  return (
    <div className="modal-veil" onClick={handleBackdropClick} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pv-new-request-heading"
        className="modal"
        style={{ width: 'min(720px, calc(100vw - 40px))', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2 id="pv-new-request-heading" className="modal__title">
            {t('shell.newIntention')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={createMutation.isPending}
            aria-label={t('common.close')}
            className="modal__close"
          >
            ×
          </button>
        </header>

        <form onSubmit={onSubmit} className="modal__body" style={{ display: 'block' }}>
          <p className="pv-muted" style={{ fontSize: 13, marginTop: 0, marginBottom: 18 }}>
            {t('request.intro')}
          </p>
          <div className="space-y-6">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pv-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {t('request.titleLabel')} <span className="text-secondary/60">·</span> {t('request.titleHint')}
              </label>
              <span className={`text-[11px] tabular-nums ${title.trim().length > TITLE_MAX ? 'text-primary' : 'pv-muted'}`}>{titleCounter}</span>
            </div>
            <Input
              id="pv-title"
              ref={titleInputRef}
              className="mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('request.titlePlaceholder')}
              maxLength={TITLE_MAX + 20}
            />
            <p className="pv-muted mt-1.5 text-xs">{t('request.titleHelp')}</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pv-body" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {t('request.bodyLabel')} <span className="text-secondary/60">·</span> {t('request.bodyHint')}
              </label>
              <span className={`text-[11px] tabular-nums ${body.trim().length > BODY_MAX ? 'text-primary' : 'pv-muted'}`}>{bodyCounter}</span>
            </div>
            <TextArea
              id="pv-body"
              className="mt-1.5 min-h-[160px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t('request.bodyPlaceholder')}
            />
            <p className="pv-muted mt-1.5 text-xs">{t('request.bodyHelp', { min: BODY_MIN })}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('request.categoryLabel')}</p>
            <p className="pv-muted mt-1 text-xs">{t('request.categoryHelp')}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {categoryOptions.map((option) => {
                const active = category === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setCategory(option.value)}
                    aria-pressed={active}
                    className={`flex items-start gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                      active
                        ? 'border-primary bg-primary/10 shadow-[0_10px_24px_-16px_var(--fx-ring)]'
                        : 'border-primary bg-panel hover:bg-primary/5'
                    }`}
                  >
                    <span className="text-xl leading-none" aria-hidden>{option.emoji}</span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-secondary'}`}>{option.label}</span>
                      <span className="block text-[11px] leading-snug text-primary/80">{option.hint}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('request.visibilityLabel')}</p>
            <p className="pv-muted mt-1 text-xs">{t('request.visibilityHelp')}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {visibilityOptions.map((option) => {
                const active = visibility === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setVisibility(option.value)}
                    aria-pressed={active}
                    className={`flex h-full flex-col gap-2 rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-primary bg-primary/10 shadow-[0_10px_24px_-16px_var(--fx-ring)]'
                        : 'border-primary bg-panel hover:bg-primary/5'
                    }`}
                  >
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ${active ? 'bg-primary text-onPrimary' : 'bg-primary/10 text-primary'}`}>
                      {option.mark}
                    </span>
                    <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-secondary'}`}>{option.label}</span>
                    <span className="text-[11px] leading-snug text-primary/80">{option.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {visibility === 'GROUP_ONLY' && (
            <div className="rounded-2xl border border-primary bg-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('request.selectGroupsLabel')}</p>
                {hasGroups && (
                  <span className="pv-muted text-[11px] tabular-nums">{t('request.groupsCount', { selected: groupIds.length, total: myGroups.length })}</span>
                )}
              </div>
              {groups.isLoading && <p className="pv-muted mt-2 text-xs">{t('request.loadingGroups')}</p>}

              {!groups.isLoading && !hasGroups && (
                <p className="pv-muted mt-2 text-xs">
                  {t('request.noGroups')}
                </p>
              )}

              {hasGroups && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {myGroups.map((group) => {
                    const checked = groupIds.includes(group.id)
                    return (
                      <button
                        key={group.id}
                        type="button"
                        aria-pressed={checked}
                        onClick={() =>
                          setGroupIds((prev) => (checked ? prev.filter((id) => id !== group.id) : [...prev, group.id]))
                        }
                        className={`pv-chip rounded-full px-3 py-1.5 text-xs ${checked ? 'pv-chip-active' : ''}`}
                      >
                        {checked ? '✓ ' : ''}{group.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <div className="rounded-2xl border border-primary bg-panel p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                checked={allowAnonymous}
                onChange={(e) => setAllowAnonymous(e.target.checked)}
                type="checkbox"
                className="mt-1 h-4 w-4 accent-current text-primary"
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-secondary">{t('request.anonymousLabel')}</span>
                <span className="pv-muted block text-xs leading-relaxed">
                  {t('request.anonymousHelp')}
                </span>
              </span>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-primary/30 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="pv-muted text-xs">
              {visibility === 'PUBLIC'
                ? t('request.footPublic')
                : visibility === 'PRIVATE'
                  ? t('request.footPrivate')
                  : groupIds.length > 0
                    ? t('request.footGroups', { count: groupIds.length })
                    : t('request.footSelectGroup')}
            </p>
            <div className="flex gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={onClose} disabled={createMutation.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {createMutation.isPending ? t('request.publishing') : t('request.publish')}
              </Button>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{error}</p>}
          </div>
        </form>
      </div>
    </div>
  )
}
