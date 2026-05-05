import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PageShell } from '@/components/page-shell'
import { Avatar } from '@/components/avatar'
import { api } from '@/lib/api'
import { Input } from '@/components/input'
import { TextArea } from '@/components/text-area'
import { Button } from '@/components/button'
import { useToast } from '@/components/toaster'
import { useConfirm } from '@/components/confirm-dialog'
import { errorMessage } from '@/lib/api-error'
import { Tradition, traditionOptions } from '@/lib/traditions'
import { AvatarUploadError, AVATAR_MAX_BYTES, AVATAR_ACCEPTED_MIMES, uploadAvatar } from '@/lib/supabase'

const BIO_MAX = 280

type Profile = {
  id: string
  username: string
  displayName: string
  avatarUrl?: string | null
  bio?: string | null
  tradition: Tradition
}

export function ProfilePage() {
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [bio, setBio] = useState('')
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [avatarStatus, setAvatarStatus] = useState('')
  const [avatarError, setAvatarError] = useState('')
  const [traditionStatus, setTraditionStatus] = useState('')

  const profile = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const res = await api.get<Profile>('/profile')
      return res.data
    }
  })

  useEffect(() => {
    if (!profile.data) return
    setDisplayName(profile.data.displayName || '')
    setUsername(profile.data.username || '')
    setBio(profile.data.bio || '')
  }, [profile.data])

  const invalidateProfileEverywhere = async () => {
    await Promise.all([
      profile.refetch(),
      queryClient.invalidateQueries({ queryKey: ['profile', 'shell'] }),
      queryClient.invalidateQueries({ queryKey: ['profile', 'public'] })
    ])
  }

  const traditionMutation = useMutation({
    mutationFn: async (tradition: Tradition) => {
      const res = await api.patch<Profile>('/profile/tradition', { tradition })
      return res.data
    },
    onSuccess: async () => {
      setTraditionStatus('Tradição atualizada. Seu feed foi ajustado.')
      await Promise.all([
        invalidateProfileEverywhere(),
        queryClient.invalidateQueries({ queryKey: ['profile', 'feed'] }),
        queryClient.invalidateQueries({ queryKey: ['feed'] })
      ])
    },
    onError: () => {
      setTraditionStatus('Não foi possível atualizar a tradição.')
    }
  })

  const saveProfile = useMutation({
    mutationFn: async () => {
      const trimmedBio = bio.trim()
      await api.patch('/profile', {
        displayName,
        username,
        bio: trimmedBio === '' ? null : trimmedBio
      })
    },
    onSuccess: async () => {
      setError('')
      setStatus('Perfil atualizado com sucesso.')
      await invalidateProfileEverywhere()
    },
    onError: (err: any) => {
      setStatus('')
      if (err?.response?.status === 401) {
        setError('Sua sessão expirou. Entre novamente para salvar seu perfil.')
        return
      }
      setError(err?.response?.data?.error?.message || err?.message || 'Não foi possível salvar o perfil.')
    }
  })

  const updateAvatar = useMutation({
    mutationFn: async (avatarUrl: string | null) => {
      const res = await api.patch<Profile>('/profile', {
        displayName,
        username,
        avatarUrl
      })
      return res.data
    },
    onSuccess: async (_data, variables) => {
      setAvatarError('')
      setAvatarStatus(variables ? 'Foto atualizada.' : 'Foto removida.')
      await invalidateProfileEverywhere()
    },
    onError: () => {
      setAvatarStatus('')
      setAvatarError('Não foi possível salvar a nova foto.')
    }
  })

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!profile.data) throw new Error('Perfil não carregou ainda.')
      return uploadAvatar(file, profile.data.id)
    },
    onSuccess: (publicUrl) => {
      updateAvatar.mutate(publicUrl)
    },
    onError: (err: unknown) => {
      setAvatarStatus('')
      if (err instanceof AvatarUploadError) {
        setAvatarError(err.message)
      } else {
        setAvatarError('Falha ao enviar a imagem.')
      }
    }
  })

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setAvatarError('')
    setAvatarStatus('')
    uploadMutation.mutate(file)
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setStatus('')
    if (displayName.trim().length < 2) {
      setError('Informe um nome de exibição com pelo menos 2 caracteres.')
      return
    }
    if (!/^[a-z0-9_]{3,30}$/.test(username.trim().replace('@', ''))) {
      setError('Use um @username de 3 a 30 caracteres, apenas letras minúsculas, números e _.')
      return
    }
    if (bio.trim().length > BIO_MAX) {
      setError(`A bio precisa ter até ${BIO_MAX} caracteres.`)
      return
    }
    saveProfile.mutate()
  }

  const avatarUploadBusy = uploadMutation.isPending || updateAvatar.isPending
  const previewUser = {
    displayName: displayName || profile.data?.displayName,
    username: username || profile.data?.username,
    avatarUrl: profile.data?.avatarUrl ?? null
  }
  const bioCount = bio.trim().length
  const acceptAttr = AVATAR_ACCEPTED_MIMES.join(',')
  const maxMb = Math.round(AVATAR_MAX_BYTES / (1024 * 1024))

  return (
    <PageShell>
      <section className="pv-panel rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Foto de perfil</p>
        <h1 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">Sua imagem</h1>
        <p className="pv-muted mt-2 text-sm">
          Aparece no header, nos cards do mural e na sua página pública. JPG, PNG ou WEBP até {maxMb} MB.
        </p>

        <div className="mt-5 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
          <Avatar user={previewUser} size="xl" />
          <div className="flex-1">
            <input
              ref={fileInputRef}
              type="file"
              accept={acceptAttr}
              className="hidden"
              onChange={onFileChange}
              aria-label="Selecionar foto de perfil"
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={avatarUploadBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadMutation.isPending ? 'Enviando…' : profile.data?.avatarUrl ? 'Trocar foto' : 'Enviar foto'}
              </Button>
              {profile.data?.avatarUrl && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={avatarUploadBusy}
                  onClick={() => {
                    setAvatarError('')
                    setAvatarStatus('')
                    updateAvatar.mutate(null)
                  }}
                >
                  Remover foto
                </Button>
              )}
            </div>
            {avatarStatus && (
              <p role="status" className="mt-3 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{avatarStatus}</p>
            )}
            {avatarError && (
              <p role="alert" className="mt-3 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{avatarError}</p>
            )}
          </div>
        </div>
      </section>

      <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Conta</p>
        <h2 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">Meu perfil</h2>
        <p className="pv-muted mt-2 text-sm">Nome público, @username e bio mostrados na sua página de perfil.</p>

        <form className="mt-6 grid gap-5 lg:grid-cols-2" onSubmit={onSubmit}>
          <div className="space-y-4">
            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              Nome de exibição
              <Input onChange={(e) => setDisplayName(e.target.value)} placeholder="Como seu nome aparece no app" value={displayName} />
              <span className="pv-muted mt-1 block text-[11px] normal-case tracking-normal">Nome mostrado nos pedidos, grupos e amizades.</span>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              @username
              <Input onChange={(e) => setUsername(e.target.value.replace(/@/g, '').toLowerCase())} placeholder="seu_username" value={username} />
              <span className="pv-muted mt-1 block text-[11px] normal-case tracking-normal">Identificador único para encontrar e adicionar você.</span>
            </label>

            <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-primary">
              <span className="flex items-baseline justify-between gap-2">
                <span>Bio</span>
                <span className={`text-[11px] tabular-nums ${bioCount > BIO_MAX ? 'text-primary' : 'pv-muted'}`}>{bioCount}/{BIO_MAX}</span>
              </span>
              <TextArea
                className="mt-1.5 min-h-[100px]"
                onChange={(e) => setBio(e.target.value)}
                placeholder="Conte um pouco sobre você. Aparece no seu perfil público."
                value={bio}
              />
              <span className="pv-muted mt-1 block text-[11px] normal-case tracking-normal">Visível para qualquer pessoa que abrir seu perfil.</span>
            </label>
          </div>

          <div className="rounded-2xl border border-primary bg-panel p-4">
            <p className="text-sm text-secondary">Prévia do perfil</p>
            <div className="mt-4 flex items-center gap-3">
              <Avatar user={previewUser} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-secondary">{displayName || 'Seu nome'}</p>
                <p className="pv-muted truncate text-sm">@{username || 'username'}</p>
              </div>
            </div>
            {bio.trim() && <p className="pv-muted mt-3 whitespace-pre-line text-sm leading-relaxed text-secondary/90">{bio}</p>}

            {status && <p role="status" className="mt-4 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{status}</p>}
            {error && <p role="alert" className="mt-4 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{error}</p>}

            <Button className="mt-5 w-full sm:w-auto" disabled={saveProfile.isPending} type="submit">
              {saveProfile.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </form>
      </section>

      <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Tradição</p>
        <h2 className="pv-title mt-2 text-xl font-bold text-secondary sm:text-2xl">Minha tradição</h2>
        <p className="pv-muted mt-2 text-sm">
          Isso define as ações de oração disponíveis e o feed que você vê. Ao trocar, você passa a ver apenas pedidos da nova tradição.
        </p>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {traditionOptions.map((option) => {
            const active = profile.data?.tradition === option.value
            return (
              <button
                key={option.value}
                type="button"
                disabled={traditionMutation.isPending || active}
                onClick={() => {
                  setTraditionStatus('')
                  traditionMutation.mutate(option.value)
                }}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-4 text-left transition ${active ? 'border-primary bg-primary/10 shadow-[0_10px_24px_-16px_var(--fx-ring)]' : 'border-primary bg-panel hover:bg-primary/5'} disabled:cursor-default`}
                aria-pressed={active}
              >
                <span className="text-2xl leading-none" aria-hidden>{option.emoji}</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-semibold ${active ? 'text-primary' : 'text-secondary'}`}>
                    {option.label}{active ? ' — atual' : ''}
                  </span>
                  <span className="block text-[12px] leading-snug text-primary/80">{option.description}</span>
                </span>
              </button>
            )
          })}
        </div>

        {traditionStatus && (
          <p className="mt-4 rounded-xl border border-primary bg-panel px-3 py-2 text-sm text-primary">{traditionStatus}</p>
        )}
      </section>

      <BlockedUsersSection />
    </PageShell>
  )
}

type BlockedUser = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string | null
  blockedAt: string
}

function BlockedUsersSection() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()

  const blocksQuery = useQuery({
    queryKey: ['blocks'],
    queryFn: async () => {
      const res = await api.get<{ items: BlockedUser[] }>('/blocks')
      return res.data.items
    }
  })

  const unblock = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/blocks/${userId}`)
    },
    onSuccess: async () => {
      toast.success('Usuário desbloqueado.')
      await queryClient.invalidateQueries({ queryKey: ['blocks'] })
    },
    onError: (err) => toast.error(errorMessage(err))
  })

  async function handleUnblock(user: BlockedUser) {
    const ok = await confirm({
      title: 'Desbloquear usuário',
      description: `Desbloquear @${user.username}?`,
      confirmLabel: 'Desbloquear'
    })
    if (ok) unblock.mutate(user.userId)
  }

  return (
    <section className="pv-panel mt-5 rounded-3xl p-6 sm:p-7">
      <h2 className="pv-title text-xl font-semibold text-secondary">Usuários bloqueados</h2>
      <p className="pv-muted mt-1 text-sm">
        Pessoas bloqueadas não veem seus pedidos e você não vê os delas. Amizades e solicitações são desfeitas ao bloquear.
      </p>
      <div className="mt-4 space-y-3">
        {blocksQuery.isLoading && (
          [0, 1].map((i) => <span key={i} className="pv-shimmer block h-12 rounded-2xl" />)
        )}
        {!blocksQuery.isLoading && (blocksQuery.data ?? []).length === 0 && (
          <p className="pv-muted rounded-2xl border border-primary bg-panel p-4 text-sm">
            Você não bloqueou ninguém.
          </p>
        )}
        {(blocksQuery.data ?? []).map((user) => (
          <article key={user.userId} className="flex items-start gap-3 rounded-2xl border border-primary bg-panel p-4">
            <Avatar user={user} size="md" />
            <div className="min-w-0 flex-1">
              <Link to={`/u/${user.username}`} className="block truncate text-sm font-semibold text-secondary hover:text-primary">
                {user.displayName}
              </Link>
              <p className="pv-muted mt-1 truncate text-xs">@{user.username}</p>
              <p className="pv-muted mt-1 text-xs">Bloqueado em {new Date(user.blockedAt).toLocaleDateString('pt-BR')}</p>
            </div>
            <Button variant="secondary" disabled={unblock.isPending} onClick={() => handleUnblock(user)}>
              Desbloquear
            </Button>
          </article>
        ))}
      </div>
    </section>
  )
}
