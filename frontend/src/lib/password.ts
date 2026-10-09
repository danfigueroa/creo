// Regra única de senha do app. O mesmo mínimo precisa estar configurado no
// painel do Supabase (Auth → Providers → Email), que é quem de fato recusa.
export const PASSWORD_MIN = 8

export function isEmailNotConfirmed(raw: string | undefined): boolean {
  return (raw || '').toLowerCase().includes('email not confirmed')
}
