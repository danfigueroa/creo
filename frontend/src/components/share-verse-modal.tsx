import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { TextArea } from '@/components/text-area'
import { Button } from '@/components/button'
import { api } from '@/lib/api'
import type { BibleVerse, VerseShareVisibility } from '@/components/feed-card'

type Props = {
  open: boolean
  verse: BibleVerse | null
  onClose: () => void
  onShared?: () => void
}

// Espelha verseCommentMaxRunes no service Go.
const COMMENT_MAX = 500

const VISIBILITY_ORDER: VerseShareVisibility[] = ['PUBLIC', 'FRIENDS', 'GROUP_ONLY', 'PRIVATE']

const VISIBILITY_MARKS: Record<VerseShareVisibility, string> = {
  PUBLIC: 'PU',
  FRIENDS: 'AM',
  GROUP_ONLY: 'GR',
  PRIVATE: 'PR'
}

export function ShareVerseModal({ open, verse, onClose, onShared }: Props) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [comment, setComment] = useState('')
  const [visibility, setVisibility] = useState<VerseShareVisibility>('PUBLIC')
  const [groupIds, setGroupIds] = useState<string[]>([])
  const [error, setError] = useState('')
  const commentRef = useRef<HTMLTextAreaElement | null>(null)

  const visibilityOptions = VISIBILITY_ORDER.map((value) => ({
    value,
    mark: VISIBILITY_MARKS[value],
    label: t(`verseVisibility.${value}.label`),
    description: t(`verseVisibility.${value}.description`)
  }))

  const groups = useQuery({
    queryKey: ['groups', 'mine', 'for-request'],
    enabled: open,
    queryFn: async () => {
      const res = await api.get<{ items: Array<{ id: string; name: string }> }>('/groups')
      return res.data.items
    }
  })

  const shareMutation = useMutation({
    mutationFn: async () => {
      await api.post('/verses/shares', {
        verseId: verse?.id,
        comment: comment.trim(),
        visibility,
        groupIds: visibility === 'GROUP_ONLY' ? groupIds : []
      })
    },
    onSuccess: async () => {
      setError('')
      const targetGroupIds = visibility === 'GROUP_ONLY' ? groupIds : []
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['feed'] }),
        queryClient.invalidateQueries({ queryKey: ['verse', 'today'] }),
        ...targetGroupIds.map((gid) => queryClient.invalidateQueries({ queryKey: ['group', gid, 'feed'] }))
      ])
      onShared?.()
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
      setError(err?.response?.data?.error?.message || t('verse.errorShare'))
    }
  })

  const commentValid = comment.trim().length <= COMMENT_MAX
  const groupsValid = visibility !== 'GROUP_ONLY' || groupIds.length > 0
  const canSubmit = Boolean(verse) && commentValid && groupsValid && !shareMutation.isPending

  const myGroups = groups.data ?? []
  const hasGroups = myGroups.length > 0
  const commentCounter = useMemo(() => `${comment.trim().length}/${COMMENT_MAX}`, [comment])

  useEffect(() => {
    if (!open) {
      // Reabrir o modal não deve herdar o rascunho do compartilhamento anterior.
      setComment('')
      setVisibility('PUBLIC')
      setGroupIds([])
      setError('')
      return
    }
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => commentRef.current?.focus(), 50)
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && !shareMutation.isPending) {
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKey)
      window.clearTimeout(focusTimer)
    }
  }, [open, shareMutation.isPending, onClose])

  if (!open || !verse) {
    return null
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!commentValid) {
      setError(t('verse.commentTooLong', { max: COMMENT_MAX }))
      return
    }
    if (visibility === 'GROUP_ONLY' && groupIds.length === 0) {
      setError(t('request.selectGroup'))
      return
    }
    shareMutation.mutate()
  }

  function handleBackdropClick() {
    if (shareMutation.isPending) {
      return
    }
    onClose()
  }

  return (
    <div className="modal-veil" onClick={handleBackdropClick} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pv-share-verse-heading"
        className="modal"
        style={{ width: 'min(640px, calc(100vw - 40px))', maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal__head">
          <h2 id="pv-share-verse-heading" className="modal__title">
            {t('verse.shareTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={shareMutation.isPending}
            aria-label={t('common.close')}
            className="modal__close"
          >
            ×
          </button>
        </header>

        <form onSubmit={onSubmit} className="modal__body" style={{ display: 'block' }}>
          <blockquote className="verse verse--preview">
            {verse.text ? (
              <p className="verse__text">{verse.text}</p>
            ) : (
              <p className="verse__text verse__text--missing">{t('verse.textUnavailable')}</p>
            )}
            <cite className="verse__ref">{verse.reference}</cite>
          </blockquote>

          <div style={{ marginTop: 18 }}>
            <label htmlFor="pv-verse-comment" className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {t('verse.commentLabel')}
              </span>
              <span className="pv-muted mt-1 block text-xs">{t('verse.commentHelp')}</span>
            </label>
            <TextArea
              id="pv-verse-comment"
              ref={commentRef}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={4}
              maxLength={COMMENT_MAX}
              placeholder={t('verse.commentPlaceholder')}
              className="mt-2"
            />
            <span className="pv-muted mt-1 block text-right text-[11px] tabular-nums">{commentCounter}</span>
          </div>

          <div style={{ marginTop: 18 }}>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              {t('verse.visibilityLabel')}
            </p>
            <p className="pv-muted mt-1 text-xs">{t('verse.visibilityHelp')}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
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
                    <span
                      className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold ${
                        active ? 'bg-primary text-onPrimary' : 'bg-primary/10 text-primary'
                      }`}
                    >
                      {option.mark}
                    </span>
                    <span className={`text-sm font-semibold ${active ? 'text-primary' : 'text-secondary'}`}>
                      {option.label}
                    </span>
                    <span className="text-[11px] leading-snug text-primary/80">{option.description}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {visibility === 'GROUP_ONLY' && (
            <div className="mt-4 rounded-2xl border border-primary bg-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                  {t('request.selectGroupsLabel')}
                </p>
                {hasGroups && (
                  <span className="pv-muted text-[11px] tabular-nums">
                    {t('request.groupsCount', { selected: groupIds.length, total: myGroups.length })}
                  </span>
                )}
              </div>
              {groups.isLoading && <p className="pv-muted mt-2 text-xs">{t('request.loadingGroups')}</p>}
              {!groups.isLoading && !hasGroups && <p className="pv-muted mt-2 text-xs">{t('request.noGroups')}</p>}
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
                          setGroupIds((prev) =>
                            checked ? prev.filter((id) => id !== group.id) : [...prev, group.id]
                          )
                        }
                        className={`pv-chip rounded-full px-3 py-1.5 text-xs ${checked ? 'pv-chip-active' : ''}`}
                      >
                        {checked ? '✓ ' : ''}
                        {group.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary"
            >
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center justify-end gap-3">
            <Button type="button" variant="secondary" onClick={onClose} disabled={shareMutation.isPending}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {shareMutation.isPending ? t('verse.sharing') : t('verse.shareAction')}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
