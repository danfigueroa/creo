// Pessoas fictícias das demonstrações da landing. Os nomes não passam por
// i18n de propósito: servem nos três idiomas, e o Avatar deriva o tom do
// username, então cada pessoa tem sempre a mesma cor.
export type DemoPerson = { displayName: string; username: string }

export const demoAuthor: DemoPerson = { displayName: 'Helena Costa', username: 'helena_costa' }

export const demoPeople: DemoPerson[] = [
  { displayName: 'Ana Ribeiro', username: 'ana_ribeiro' },
  { displayName: 'Pedro Lima', username: 'pedro_lima' },
  { displayName: 'Marta Souza', username: 'marta_souza' },
  { displayName: 'João Alves', username: 'joao_alves' },
  { displayName: 'Lúcia Prado', username: 'lucia_prado' },
  { displayName: 'Tiago Nunes', username: 'tiago_nunes' },
  { displayName: 'Rita Gomes', username: 'rita_gomes' },
  { displayName: 'Davi Rocha', username: 'davi_rocha' }
]

export const demoVisitor: DemoPerson = { displayName: 'Você', username: 'voce' }

// Contagens de partida das cinco orações de cada tradição, na ordem de
// prayerActionsFor.
export const demoCounts = [12, 7, 4, 3, 1]

// Tom da categoria Saúde, igual ao CATEGORY_PALETTE de feed-card.tsx. Copiado
// em vez de importado: a landing está no bundle inicial e puxar o feed-card
// traria o card inteiro junto.
export const healthPill = { background: 'oklch(0.93 0.03 145)', color: 'oklch(0.38 0.08 145)' }
