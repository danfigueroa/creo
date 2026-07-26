import i18n from '@/lib/i18n'

// Espelha models.PublicFriendshipState do backend, limitado aos valores que a
// busca de usuários devolve — bloqueios saem filtrados do resultado, então
// BLOCKED_BY_ME/BLOCKED_BY_THEM/SELF não chegam aqui.
export type SearchFriendshipStatus = 'FRIEND' | 'PENDING_OUT' | 'PENDING_IN' | 'NONE'

// Rótulo do vínculo já existente com quem apareceu na busca. Devolve null
// quando não há vínculo, sinalizando ao chamador que ele deve renderizar o
// botão de adicionar. Cancelar/aceitar/rejeitar vivem em /u/:username.
export function searchFriendshipLabel(status?: SearchFriendshipStatus): string | null {
  switch (status) {
    case 'FRIEND':
      return `✓ ${i18n.t('pubProfile.friends')}`
    case 'PENDING_OUT':
      return i18n.t('pubProfile.requestSentLabel')
    case 'PENDING_IN':
      return i18n.t('pubProfile.requestReceivedLabel')
    default:
      return null
  }
}

// Mesma coisa em copy curta, pra pílula do dropdown de busca do shell, onde a
// frase completa não cabe.
export function searchFriendshipLabelCompact(status?: SearchFriendshipStatus): string | null {
  switch (status) {
    case 'FRIEND':
      return i18n.t('pubProfile.friends')
    case 'PENDING_OUT':
      return i18n.t('shell.sent')
    case 'PENDING_IN':
      return i18n.t('shell.received')
    default:
      return null
  }
}
