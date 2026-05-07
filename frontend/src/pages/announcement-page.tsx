import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { PageShell } from '@/components/page-shell'
import { Input } from '@/components/input'
import { TextArea } from '@/components/text-area'
import { Button } from '@/components/button'
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

const TITLE_MIN = 3
const TITLE_MAX = 120
const BODY_MIN = 10
const BODY_MAX = 2000

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function AnnouncementPage({ mode }: { mode: 'create' | 'edit' }) {
  const { id: groupId = '', aid = '' } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [eventAt, setEventAt] = useState('')
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [photoError, setPhotoError] = useState('')

  const detailsQuery = useQuery({
    queryKey: ['group', groupId, 'details'],
    enabled: !!groupId,
    queryFn: async () => (await api.get<GroupDetails>(`/groups/${groupId}`)).data
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
      setEventAt(toDatetimeLocal(a.eventAt))
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
        setPhotoError('Falha ao enviar a imagem.')
      }
    }
  })

  const persist = useMutation({
    mutationFn: async () => {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        eventAt,
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
      setError(err?.response?.data?.error?.message || 'Não foi possível salvar o anúncio.')
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
  const eventValid = !!eventAt
  const canSubmit = titleValid && bodyValid && eventValid && !persist.isPending && !upload.isPending

  const titleCounter = useMemo(() => `${trimmedTitle.length}/${TITLE_MAX}`, [trimmedTitle])
  const bodyCounter = useMemo(() => `${trimmedBody.length}/${BODY_MAX}`, [trimmedBody])

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (!titleValid) {
      setError(`O título precisa ter entre ${TITLE_MIN} e ${TITLE_MAX} caracteres.`)
      return
    }
    if (!bodyValid) {
      setError(`A descrição precisa ter entre ${BODY_MIN} e ${BODY_MAX} caracteres.`)
      return
    }
    if (!eventValid) {
      setError('Informe a data e hora do evento.')
      return
    }
    persist.mutate()
  }

  const acceptAttr = IMAGE_ACCEPTED_MIMES.join(',')
  const maxMb = Math.round(IMAGE_MAX_BYTES / (1024 * 1024))

  return (
    <PageShell>
      <section className="pv-panel rounded-3xl p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          {mode === 'edit' ? 'Editar anúncio' : 'Novo anúncio'}
        </p>
        <h1 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">
          {mode === 'edit' ? 'Atualizar anúncio do grupo' : 'Avise o grupo sobre um evento'}
        </h1>
        <p className="pv-muted mt-2 max-w-2xl text-sm">
          Anúncios aparecem no mural do grupo e no feed inicial dos membros, e disparam uma notificação.
          {details?.name ? <> Grupo: <span className="font-semibold text-primary">{details.name}</span>.</> : null}
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-7">
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pv-ann-title" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Título <span className="text-secondary/60">·</span> chame atenção
              </label>
              <span className={`text-[11px] tabular-nums ${trimmedTitle.length > TITLE_MAX ? 'text-primary' : 'pv-muted'}`}>{titleCounter}</span>
            </div>
            <Input
              id="pv-ann-title"
              className="mt-1.5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex.: Encontro de oração da pastoral familiar"
              maxLength={TITLE_MAX + 20}
            />
            <p className="pv-muted mt-1.5 text-xs">Entre {TITLE_MIN} e {TITLE_MAX} caracteres.</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="pv-ann-body" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
                Descrição <span className="text-secondary/60">·</span> detalhes do evento
              </label>
              <span className={`text-[11px] tabular-nums ${trimmedBody.length > BODY_MAX ? 'text-primary' : 'pv-muted'}`}>{bodyCounter}</span>
            </div>
            <TextArea
              id="pv-ann-body"
              className="mt-1.5 min-h-[160px]"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Conte o que vai acontecer: local, programação, intenções, link da reunião…"
            />
            <p className="pv-muted mt-1.5 text-xs">Entre {BODY_MIN} e {BODY_MAX} caracteres.</p>
          </div>

          <div>
            <label htmlFor="pv-ann-eventat" className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
              Data e hora <span className="text-secondary/60">·</span> quando vai acontecer
            </label>
            <input
              id="pv-ann-eventat"
              type="datetime-local"
              className="mt-1.5 block w-full rounded-2xl border border-primary bg-panel px-3 py-2 text-sm text-secondary"
              value={eventAt}
              onChange={(e) => setEventAt(e.target.value)}
            />
            <p className="pv-muted mt-1.5 text-xs">Data principal do evento. Pode ser editada depois.</p>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Imagem (opcional)</p>
            <p className="pv-muted mt-1 text-xs">JPG, PNG ou WEBP até {maxMb} MB. Aparece no card do anúncio.</p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {imageUrl ? (
                <img
                  src={imageUrl}
                  alt=""
                  className="h-24 w-40 rounded-xl border border-primary/30 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <span className="inline-flex h-24 w-40 items-center justify-center rounded-xl border border-dashed border-primary/40 text-xs text-primary/70">
                  Sem imagem
                </span>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptAttr}
                className="hidden"
                onChange={onFileChange}
                aria-label="Selecionar imagem do anúncio"
              />
              <Button type="button" disabled={upload.isPending} onClick={() => fileInputRef.current?.click()}>
                {upload.isPending ? 'Enviando…' : imageUrl ? 'Trocar imagem' : 'Enviar imagem'}
              </Button>
              {imageUrl && (
                <Button type="button" variant="secondary" disabled={upload.isPending} onClick={() => setImageUrl(null)}>
                  Remover
                </Button>
              )}
            </div>
            {photoError && <p role="alert" className="mt-3 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{photoError}</p>}
          </div>

          <div className="flex flex-col gap-3 border-t border-primary/30 pt-5 sm:flex-row sm:items-center sm:justify-end">
            <Button type="button" variant="secondary" onClick={() => navigate(`/groups/${groupId}?tab=mural`)} disabled={persist.isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {persist.isPending ? 'Salvando…' : mode === 'edit' ? 'Salvar alterações' : 'Publicar anúncio'}
            </Button>
          </div>

          {error && <p role="alert" className="rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{error}</p>}
        </form>
      </section>
    </PageShell>
  )
}
