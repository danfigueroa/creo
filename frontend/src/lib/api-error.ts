import { AxiosError } from 'axios'

export type ApiError = {
  code: string
  message: string
  status?: number
  details?: Record<string, unknown>
}

const PT_MESSAGES: Record<string, string> = {
  INVALID_JSON: 'Não conseguimos ler os dados enviados.',
  VALIDATION_ERROR: 'Dados inválidos. Confira os campos.',
  FORBIDDEN: 'Você não tem permissão para esta ação.',
  PERMISSION_DENIED: 'Você não tem permissão para esta ação.',
  NOT_FOUND: 'Não encontramos esse item.',
  GROUP_NOT_FOUND: 'Grupo não encontrado.',
  USER_NOT_FOUND: 'Usuário não encontrado.',
  FRIEND_REQUEST_NOT_FOUND: 'Solicitação de amizade não encontrada.',
  FRIENDSHIP_NOT_FOUND: 'Amizade não encontrada.',
  FRIEND_REQUEST_EXISTS: 'Já existe uma solicitação de amizade.',
  CANNOT_ADD_SELF: 'Você não pode adicionar a si mesmo.',
  CANNOT_TARGET_SELF: 'Você não pode aplicar isso a si mesmo.',
  LAST_ADMIN: 'Não é possível: este é o último admin do grupo.',
  PRAYED_RATE_LIMITED: 'Você já orou por este pedido recentemente.',
  USER_SYNC_FAILED: 'Falha ao preparar seu perfil. Tente de novo.',
  INTERNAL_ERROR: 'Algo deu errado do nosso lado. Tente novamente.',
  USER_BLOCKED: 'Você bloqueou este usuário ou foi bloqueado por ele.',
  ALREADY_BLOCKED: 'Este usuário já está bloqueado.',
  BLOCK_NOT_FOUND: 'Você não tinha esse usuário bloqueado.',
  RATE_LIMITED: 'Muitas ações em pouco tempo. Espere um instante e tente de novo.',
  ACCOUNT_DELETED: 'Esta conta foi excluída.',
  ACCOUNT_DELETION_UNAVAILABLE: 'A exclusão de conta está indisponível no momento. Tente mais tarde.'
}

const FALLBACK = 'Algo deu errado. Tente novamente.'

export function parseApiError(err: unknown): ApiError {
  const axiosErr = err as AxiosError<{ error?: { code?: string; message?: string; details?: Record<string, unknown> } }> | undefined
  const data = axiosErr?.response?.data
  const code = data?.error?.code ?? (axiosErr?.code === 'ERR_NETWORK' ? 'NETWORK_ERROR' : 'INTERNAL_ERROR')
  const ptMessage = PT_MESSAGES[code]
  const message = ptMessage ?? data?.error?.message ?? axiosErr?.message ?? FALLBACK
  return {
    code,
    message,
    status: axiosErr?.response?.status,
    details: data?.error?.details
  }
}

export function errorMessage(err: unknown): string {
  return parseApiError(err).message
}
