import { FormEvent, useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PageShell } from '@/components/page-shell'
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
      <main className="canvas">
        <div className="feed__head">
          <div className="feed__eyebrow">{t('newGroup.eyebrow')}</div>
          <h1 className="feed__title">{t('newGroup.title')}</h1>
          <p className="feed__sub">{t('newGroup.sub')}</p>
        </div>

        <form onSubmit={onSubmit} className="form">
          <div className="field">
            <div className="field__row">
              <label htmlFor="pv-group-name" className="field__label">
                {t('group.nameLabel')} <span className="field__hint">· {t('newGroup.nameHint')}</span>
              </label>
              <span className={`field__count ${trimmedName.length > NAME_MAX ? 'field__count--over' : ''}`}>{nameCounter}</span>
            </div>
            <input
              id="pv-group-name"
              className="field__control"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('newGroup.namePlaceholder')}
              maxLength={NAME_MAX + 20}
            />
            <p className="field__help">{t('newGroup.nameHelp', { min: NAME_MIN, max: NAME_MAX })}</p>
          </div>

          <div className="field">
            <div className="field__row">
              <label htmlFor="pv-group-description" className="field__label">
                {t('group.descriptionLabel')} <span className="field__hint">· {t('newGroup.descriptionHint')}</span>
              </label>
              <span className={`field__count ${trimmedDescription.length > DESCRIPTION_MAX ? 'field__count--over' : ''}`}>{descriptionCounter}</span>
            </div>
            <textarea
              id="pv-group-description"
              className="field__control"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('newGroup.descriptionPlaceholder')}
            />
            <p className="field__help">{t('newGroup.descriptionHelp')}</p>
          </div>

          <div className="field">
            <span className="field__label">{t('group.joinPolicyLabel')}</span>
            <p className="field__help">{t('newGroup.policyHelp')}</p>
            <div className="choice-grid" style={{ marginTop: 6 }}>
              {policyOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setJoinPolicy(option.value)}
                  aria-pressed={joinPolicy === option.value}
                  className="choice"
                >
                  <span className="choice__mark">{option.mark}</span>
                  <span className="choice__title">{option.label}</span>
                  <span className="choice__desc">{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          {error && <p role="alert" className="canvas__alert">{error}</p>}

          <div className="form-foot">
            <p className="form-foot__note">{t('newGroup.adminNote')}</p>
            <div className="form-foot__actions">
              <button type="button" className="btn btn--ghost-out" onClick={() => navigate('/groups')} disabled={createGroup.isPending}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn--primary" disabled={!canSubmit}>
                {createGroup.isPending ? t('newGroup.creating') : t('nav.createGroup')}
              </button>
            </div>
          </div>
        </form>
      </main>
    </PageShell>
  )
}
