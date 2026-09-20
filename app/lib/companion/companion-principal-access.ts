// Revogação global imediata do Companion (STEP 2A.4, Authorization
// Hardening B).
//
// Um Companion token dura até 6 horas e uma company_memberships.is_active
// continuar true não bastam para provar que o usuário ainda pode acessar
// dados/ações sensíveis do Companion agora: se profiles.is_active_global
// virar false no meio desse período, o token antigo não sabe disso e
// continuaria funcionando até expirar. Para qualquer operação
// seller-facing sensível, TOKEN válido + MEMBERSHIP ativa + PROFILE
// globalmente ativo são requisitos INDEPENDENTES, revalidados a cada
// request — nunca apenas na emissão do token.
//
// Responsabilidade única deste módulo: ler o profile ao vivo e dizer se
// ele ainda está globalmente ativo. Nunca verifica membership, role ou
// cycle — isso é responsabilidade de quem chama este helper. Nunca lança
// um erro específico de rota: devolve um contrato simples para o
// chamador decidir como responder.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseAdminClient = any

export type CompanionPrincipalProfileRow = {
  id: string
  is_active_global: boolean | null
}

export type CompanionPrincipalAccessResult = {
  active: boolean
  error: string | null
}

// Perfil ausente (nunca existiu, ou foi apagado) é tratado como
// globalmente inativo — fail closed, nunca fail open. is_active_global
// só bloqueia quando é EXATAMENTE false (mesma convenção já usada por
// connect/route.ts, create-lead/route.ts e me/route.ts): null/undefined
// continuam sendo tratados como ativos, nunca como bloqueio silencioso
// para contas antigas sem esse campo preenchido.
export async function verifyActiveCompanionProfile({
  admin,
  userId,
}: {
  admin: AnySupabaseAdminClient
  userId: string
}): Promise<CompanionPrincipalAccessResult> {
  const { data, error } = await admin
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    return { active: false, error: error.message as string }
  }

  const profile = (data as CompanionPrincipalProfileRow | null) ?? null

  if (!profile?.id) {
    return { active: false, error: null }
  }

  return {
    active: profile.is_active_global !== false,
    error: null,
  }
}
