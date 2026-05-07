import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { PageShell } from '@/components/page-shell'
import { Button } from '@/components/button'
import { api } from '@/lib/api'

type JoinPolicy = 'OPEN' | 'REQUEST' | 'INVITE_ONLY'

type Group = {
  id: string
  name: string
  description: string
  imageUrl?: string | null
  joinPolicy: JoinPolicy
}

const policyLabel: Record<JoinPolicy, string> = {
  OPEN: 'Aberto',
  REQUEST: 'Por solicitação',
  INVITE_ONLY: 'Somente convite'
}

export function GroupsPage() {
  const groupsQuery = useQuery({
    queryKey: ['groups', 'mine'],
    queryFn: async () => {
      const res = await api.get<{ items: Group[] }>('/groups')
      return res.data.items
    }
  })

  const items = groupsQuery.data ?? []
  const isLoading = groupsQuery.isLoading
  const isError = groupsQuery.isError

  return (
    <PageShell>
      <section className="pv-panel rounded-3xl p-6 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Comunidade</p>
            <h1 className="pv-title mt-2 text-2xl font-bold text-secondary sm:text-3xl">Meus grupos</h1>
            <p className="pv-muted mt-2 max-w-2xl text-sm">
              Comunidades das quais você participa. Abra um grupo para ver o mural, gerenciar membros e responder
              solicitações.
            </p>
          </div>
          <Link to="/groups/new" className="shrink-0">
            <Button className="w-full sm:w-auto">+ Novo grupo</Button>
          </Link>
        </div>
      </section>

      <section className="mt-5">
        {isError && (
          <p className="rounded-2xl border border-primary bg-panel p-4 text-sm text-primary">
            Não foi possível carregar seus grupos. Tente novamente em instantes.
          </p>
        )}

        {isLoading && (
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="pv-panel rounded-2xl p-5">
                <span className="pv-shimmer block h-5 w-1/2 rounded" />
                <span className="pv-shimmer mt-3 block h-3 w-3/4 rounded" />
                <span className="pv-shimmer mt-2 block h-3 w-2/3 rounded" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="pv-panel flex flex-col items-start gap-3 rounded-3xl p-6 sm:p-8">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Você ainda não está em grupos</p>
            <h2 className="pv-title text-xl font-semibold text-secondary sm:text-2xl">Comece criando o seu primeiro grupo</h2>
            <p className="pv-muted max-w-xl text-sm">
              Reúna sua comunidade em um espaço dedicado de oração. Você também pode entrar em grupos existentes pela
              busca no topo.
            </p>
            <Link to="/groups/new">
              <Button>+ Criar meu primeiro grupo</Button>
            </Link>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((group) => {
              const initials = group.name.slice(0, 2).toUpperCase()
              return (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="pv-panel group flex h-full flex-col gap-3 rounded-2xl p-5 transition hover:border-primary"
                >
                  <div className="flex items-start gap-3">
                    {group.imageUrl ? (
                      <img
                        src={group.imageUrl}
                        alt=""
                        className="h-11 w-11 shrink-0 rounded-2xl border-2 border-primary object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border-2 border-primary bg-bg text-sm font-bold text-primary">
                        {initials}
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-secondary">{group.name}</h3>
                      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                        {policyLabel[group.joinPolicy]}
                      </p>
                    </div>
                  </div>
                  {group.description && (
                    <p className="pv-muted text-sm leading-relaxed line-clamp-3">{group.description}</p>
                  )}
                  <p className="mt-auto text-[11px] font-semibold uppercase tracking-[0.16em] text-primary opacity-0 transition group-hover:opacity-100">
                    Abrir grupo →
                  </p>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </PageShell>
  )
}
