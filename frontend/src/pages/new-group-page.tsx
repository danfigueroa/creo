import { FormEvent, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
import { Input } from '@/components/input'
import { TextArea } from '@/components/text-area'
import { Button } from '@/components/button'
import { api } from '@/lib/api'

type JoinPolicy = 'OPEN' | 'REQUEST' | 'INVITE_ONLY'

type Group = {
  id: string
  name: string
  description: string
  joinPolicy: JoinPolicy
}

const NAME_MIN = 3
const NAME_MAX = 80
const DESCRIPTION_MAX = 500

const POLICY_MARKS: Record<JoinPolicy, string> = { OPEN: 'AB', REQUEST: 'SO', INVITE_ONLY: 'CV' }
const POLICY_ORDER: JoinPolicy[] = ['OPEN', 'REQUEST', 'INVITE_ONLY']

export function NewGroupPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const policyOptions = POLICY_ORDER.map((value) => ({
    value,
    mark: POLICY_MARKS[value],
    label: t(`newGroup.policy.${value}.label`),
    description: t(`newGroup.policy.${value}.description`)
  }))
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [joinPolicy, setJoinPolicy] = useState<JoinPolicy>('REQUEST')
  const [error, setError] = useState('')

  const createGroup = useMutation({
    mutationFn: async () => {
      const res = await api.post<Group>('/groups', {
        name: name.trim(),
        description: description.trim(),
        joinPolicy,
        imageUrl: null
      })
      return res.data
    },
    onSuccess: (group) => {
      navigate(`/groups/${group.id}`)
    },
    onError: (err: any) => {
      if (err?.response?.status === 401) {
        setError(t('newGroup.sessionExpired'))
        return
      }
      if (!err?.response) {
        setError(t('request.errorBackendDown'))
        return
      }
      setError(err?.response?.data?.error?.message || t('newGroup.createError'))
    }
  })

  const trimmedName = name.trim()
  const trimmedDescription = description.trim()
  const nameValid = trimmedName.length >= NAME_MIN && trimmedName.length <= NAME_MAX
  const descriptionValid = trimmedDescription.length <= DESCRIPTION_MAX
  const canSubmit = nameValid && descriptionValid && !createGroup.isPending

  const nameCounter = useMemo(() => `${trimmedName.length}/${NAME_MAX}`, [trimmedName])
  const descriptionCounter = useMemo(() => `${trimmedDescription.length}/${DESCRIPTION_MAX}`, [trimmedDescription])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!nameValid) {
      setError(t('newGroup.nameRange', { min: NAME_MIN, max: NAME_MAX }))
      return
    }
    if (!descriptionValid) {
      setError(t('newGroup.descriptionMax', { max: DESCRIPTION_MAX }))
      return
    }
    createGroup.mutate()
  }

  return (
    <PageShell>
      <section className="pv-panel rounded-3xl p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{t('newGroup.eyebrow')}</p>
        <h1 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">{t('newGroup.title')}</h1>
        <p className="pv-muted mt-2 max-w-2xl text-sm">
          {t('newGroup.sub')}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-8">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pv-group-name" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {t('group.nameLabel')} <span className="text-secondary/60">·</span> {t('newGroup.nameHint')}
              </label>
              <span className={`text-[11px] tabular-nums ${trimmedName.length > NAME_MAX ? 'text-primary' : 'pv-muted'}`}>{nameCounter}</span>
            </div>
            <Input
              id="pv-group-name"
              className="mt-1.5"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('newGroup.namePlaceholder')}
              maxLength={NAME_MAX + 20}
            />
            <p className="pv-muted mt-1.5 text-xs">{t('newGroup.nameHelp', { min: NAME_MIN, max: NAME_MAX })}</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pv-group-description" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                {t('group.descriptionLabel')} <span className="text-secondary/60">·</span> {t('newGroup.descriptionHint')}
              </label>
              <span className={`text-[11px] tabular-nums ${trimmedDescription.length > DESCRIPTION_MAX ? 'text-primary' : 'pv-muted'}`}>{descriptionCounter}</span>
            </div>
            <TextArea
              id="pv-group-description"
              className="mt-1.5 min-h-[140px]"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('newGroup.descriptionPlaceholder')}
            />
            <p className="pv-muted mt-1.5 text-xs">{t('newGroup.descriptionHelp')}</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('group.joinPolicyLabel')}</p>
            <p className="pv-muted mt-1 text-xs">{t('newGroup.policyHelp')}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {policyOptions.map((option) => {
                const active = joinPolicy === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setJoinPolicy(option.value)}
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

          <div className="flex flex-col gap-3 border-t border-primary/30 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="pv-muted text-xs">{t('newGroup.adminNote')}</p>
            <div className="flex gap-2 sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => navigate('/groups')} disabled={createGroup.isPending}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {createGroup.isPending ? t('newGroup.creating') : t('nav.createGroup')}
              </Button>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{error}</p>}
        </form>
      </section>
    </PageShell>
  )
}
