import { FormEvent, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Glyph, type GlyphKind } from '@/components/glyph'
import { api } from '@/lib/api'
import { type Tradition } from '@/lib/traditions'

const STEPS = [
  { id: 'welcome', title: 'Boas-vindas' },
  { id: 'denom', title: 'Sua tradição' },
  { id: 'interests', title: 'O que move você' },
  { id: 'friends', title: 'Quem reza com você' },
  { id: 'first', title: 'Sua primeira intenção' },
  { id: 'tour', title: 'Um pequeno tour' }
] as const

const DENOM_OPTIONS: Array<{ id: Tradition; label: string; hint: string }> = [
  { id: 'CATHOLIC', label: 'Católico', hint: 'Ave Maria, Pai Nosso, Glória, Terço, Rosário' },
  { id: 'EVANGELICAL', label: 'Evangélico', hint: 'Orei, Intercessão, Gratidão, Jejum, Clamor' }
]

const INTERESTS: Array<{ id: string; label: string; glyph: GlyphKind; tone: number }> = [
  { id: 'saude', label: 'Saúde', glyph: 'diamond', tone: 145 },
  { id: 'familia', label: 'Família', glyph: 'rose', tone: 25 },
  { id: 'trabalho', label: 'Trabalho', glyph: 'sun', tone: 75 },
  { id: 'luto', label: 'Luto', glyph: 'ring', tone: 250 },
  { id: 'gratidao', label: 'Gratidão', glyph: 'diamond', tone: 95 },
  { id: 'vocacao', label: 'Vocação', glyph: 'beads', tone: 200 },
  { id: 'relacoes', label: 'Relações', glyph: 'rose', tone: 340 },
  { id: 'pais', label: 'País / mundo', glyph: 'ring', tone: 220 }
]

const SUGGESTED_FRIENDS = [
  { name: 'Amanda Mendes', initials: 'A', tone: 25, ctx: '3 amigos em comum' },
  { name: 'Marcus Santana', initials: 'M', tone: 145, ctx: 'Mesmo grupo: Catequistas SP' },
  { name: 'Beatriz Coelho', initials: 'B', tone: 340, ctx: 'Encontrada por contatos' },
  { name: 'Pe. Joaquim', initials: 'J', tone: 95, ctx: 'Líder do Grupo São Bento' },
  { name: 'Pastor Andrade', initials: 'P', tone: 60, ctx: 'Encontrado por contatos' },
  { name: 'Lara Figueiredo', initials: 'L', tone: 200, ctx: '2 amigos em comum' }
]

function MiniAvatar({ initials, tone, size = 40 }: { initials: string; tone: number; size?: number }) {
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: `oklch(0.92 0.03 ${tone})`,
        color: `oklch(0.38 0.08 ${tone})`,
        fontSize: Math.round(size * 0.4)
      }}
    >
      <span>{initials}</span>
    </span>
  )
}

export function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [denom, setDenom] = useState<Tradition | null>(null)
  const [interests, setInterests] = useState<Record<string, boolean>>({})
  const [friends, setFriends] = useState<Record<string, boolean>>({})
  const [firstText, setFirstText] = useState('')

  const saveTradition = useMutation({
    mutationFn: async (t: Tradition) => {
      await api.patch('/profile/tradition', { tradition: t })
    }
  })

  const createIntention = useMutation({
    mutationFn: async (body: string) => {
      await api.post('/requests', {
        title: 'Minha primeira intenção',
        body: body.trim(),
        category: 'OTHER',
        visibility: 'PUBLIC',
        allowAnonymous: false,
        groupIds: []
      })
    }
  })

  function complete() {
    window.localStorage.setItem('creo-onboarded', 'true')
    if (interests && Object.keys(interests).filter((k) => interests[k]).length > 0) {
      window.localStorage.setItem(
        'creo-interests',
        Object.keys(interests).filter((k) => interests[k]).join(',')
      )
    }
    navigate('/feed', { replace: true })
  }

  function next() {
    if (step === 1 && denom) {
      saveTradition.mutate(denom)
    }
    if (step === 4 && firstText.trim()) {
      createIntention.mutate(firstText)
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      complete()
    }
  }

  function back() {
    if (step > 0) setStep(step - 1)
  }

  function toggle<T extends Record<string, boolean>>(map: T, set: (m: T) => void, key: string) {
    set({ ...map, [key]: !map[key] } as T)
  }

  const interestCount = Object.values(interests).filter(Boolean).length
  const friendCount = Object.values(friends).filter(Boolean).length

  return (
    <div className="app app--onb" data-screen-label="Onboarding">
      <div className="onb">
        <div className="onb__progress">
          {STEPS.map((s, i) => (
            <span
              key={s.id}
              className={`onb__pip ${i === step ? 'is-on' : ''} ${i < step ? 'is-done' : ''}`}
            />
          ))}
        </div>

        <div className="onb__stage">
          {step === 0 && (
            <div key="welcome" className="onb__step onb__welcome">
              <div className="onb__mark"><span /></div>
              <p className="onb__eyebrow">Bem-vindo ao Creo</p>
              <h1 className="onb__h">Um lugar onde a oração tem tempo.</h1>
              <p className="onb__lede">
                Compartilhe intenções com quem importa. Reze por elas. Acolha as de outros. Sem
                barulho, sem performance — apenas presença.
              </p>
              <div className="onb__quote">
                <p>Onde dois ou três estiverem reunidos em meu nome, lá estarei no meio deles.</p>
                <span className="onb__quote-attr">— Mt 18,20</span>
              </div>
            </div>
          )}

          {step === 1 && (
            <div key="denom" className="onb__step">
              <p className="onb__eyebrow">Sua tradição</p>
              <h1 className="onb__h">Como você reza?</h1>
              <p className="onb__lede">
                Adaptamos as formas de oração disponíveis. Você pode mudar isso depois.
              </p>
              <div className="onb__cards">
                {DENOM_OPTIONS.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    className={`onb-card ${denom === d.id ? 'is-on' : ''}`}
                    onClick={() => setDenom(d.id)}
                  >
                    <span className="onb-card__title">{d.label}</span>
                    <span className="onb-card__hint">{d.hint}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div key="interests" className="onb__step">
              <p className="onb__eyebrow">O que move você</p>
              <h1 className="onb__h">Pelo que você se vê rezando?</h1>
              <p className="onb__lede">
                Selecione tudo que ressoa. Usamos isso para sugerir intenções e pessoas — nunca
                para anunciar nada.
              </p>
              <div className="onb__chips">
                {INTERESTS.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className={`onb-chip ${interests[it.id] ? 'is-on' : ''}`}
                    onClick={() => toggle(interests, setInterests, it.id)}
                    style={interests[it.id] ? ({ ['--chip-tone' as any]: it.tone } as Record<string, string | number>) : undefined}
                  >
                    <span className="onb-chip__glyph">
                      <Glyph kind={it.glyph} size={12} color={`oklch(0.55 0.10 ${it.tone})`} />
                    </span>
                    {it.label}
                  </button>
                ))}
              </div>
              <p className="onb__count">
                {interestCount > 0
                  ? `${interestCount} selecionado${interestCount > 1 ? 's' : ''}`
                  : '—'}
              </p>
            </div>
          )}

          {step === 3 && (
            <div key="friends" className="onb__step">
              <p className="onb__eyebrow">Quem reza com você</p>
              <h1 className="onb__h">Encontre amigos.</h1>
              <p className="onb__lede">
                Eles aparecem nos círculos mais próximos do seu mural. Você pode adicionar mais
                depois.
              </p>
              <div className="onb__friends">
                {SUGGESTED_FRIENDS.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    className={`onb-friend ${friends[f.name] ? 'is-on' : ''}`}
                    onClick={() => toggle(friends, setFriends, f.name)}
                  >
                    <MiniAvatar initials={f.initials} tone={f.tone} />
                    <div className="onb-friend__txt">
                      <span className="onb-friend__name">{f.name}</span>
                      <span className="onb-friend__ctx">{f.ctx}</span>
                    </div>
                    <span className="onb-friend__check" aria-hidden>
                      {friends[f.name] ? '✓' : '+'}
                    </span>
                  </button>
                ))}
              </div>
              <p className="onb__count">
                {friendCount > 0 ? `${friendCount} adicionado${friendCount > 1 ? 's' : ''}` : '—'}
              </p>
            </div>
          )}

          {step === 4 && (
            <div key="first" className="onb__step">
              <p className="onb__eyebrow">Sua primeira intenção</p>
              <h1 className="onb__h">O que você gostaria de partilhar?</h1>
              <p className="onb__lede">
                Pode ser breve. Pode ser uma palavra. Pode ficar privada e só sua — você escolhe
                depois.
              </p>
              <div className="onb__compose">
                <textarea
                  className="onb__textarea"
                  rows={5}
                  placeholder="Em silêncio ou em palavras…"
                  value={firstText}
                  onChange={(e) => setFirstText(e.target.value)}
                  autoFocus
                />
                <div className="onb__compose-foot">
                  <span className="onb__count-soft">
                    {firstText.length === 0 ? 'Você pode pular' : `${firstText.length} caracteres`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div key="tour" className="onb__step onb__tour">
              <p className="onb__eyebrow">Um pequeno tour</p>
              <h1 className="onb__h">Está pronto.</h1>
              <p className="onb__lede">Três coisas a saber antes de começar.</p>
              <ol className="onb__tour-list">
                <li>
                  <span className="onb__tour-num">i</span>
                  <div>
                    <strong>Reagir é rezar.</strong>
                    <span>
                      Quando você toca em uma forma de oração no post de alguém, isso conta como
                      uma oração feita.
                    </span>
                  </div>
                </li>
                <li>
                  <span className="onb__tour-num">ii</span>
                  <div>
                    <strong>Privacidade vem primeiro.</strong>
                    <span>
                      Cada intenção pode ser pública, de amigos, de um grupo — ou apenas sua. Nada
                      vaza dos círculos que você definiu.
                    </span>
                  </div>
                </li>
                <li>
                  <span className="onb__tour-num">iii</span>
                  <div>
                    <strong>Silêncio é parte.</strong>
                    <span>
                      Sem curtidas, sem números enormes. O ritmo é lento de propósito.
                    </span>
                  </div>
                </li>
              </ol>
            </div>
          )}
        </div>

        <footer className="onb__foot">
          <button
            type="button"
            className="onb__back"
            onClick={back}
            disabled={step === 0}
          >
            Voltar
          </button>
          <span className="onb__step-num">
            {step + 1} de {STEPS.length}
          </span>
          <div className="onb__cta-row">
            {step > 0 && step < STEPS.length - 1 && (
              <button type="button" className="onb__skip" onClick={complete}>
                Pular tudo
              </button>
            )}
            <button
              type="button"
              className="btn btn--primary onb__cta"
              onClick={next}
              disabled={step === 1 && !denom}
            >
              {step === 0 && 'Começar'}
              {step === 1 && (denom ? 'Continuar' : 'Escolha uma opção')}
              {step === 2 && 'Continuar'}
              {step === 3 && 'Continuar'}
              {step === 4 && (firstText.trim() ? 'Compartilhar' : 'Pular esta etapa')}
              {step === 5 && 'Entrar no Creo'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  )
}
