import { cookies } from 'next/headers'

import { getAuthedSupabase } from '@/app/lib/supabase/server'

type CommercialConfigAdminError = {
  ok: false
  status: number
  error: string
}

type CommercialConfigAdminContext = {
  ok: true
  companyId: string
  userId: string
  supabase: Awaited<ReturnType<typeof getAuthedSupabase>>['supabase']
}

export type RequireCommercialConfigAdminResult =
  | CommercialConfigAdminContext
  | CommercialConfigAdminError

export async function requireCommercialConfigAdmin(): Promise<RequireCommercialConfigAdminResult> {
  const authContext = await getAuthedSupabase().catch(() => null)

  if (!authContext) {
    return {
      ok: false,
      status: 401,
      error: 'Não autenticado.',
    }
  }

  const { supabase, user } = authContext
  const cookieStore = await cookies()
  const activeCompanyId =
    cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    return {
      ok: false,
      status: 400,
      error: 'Empresa ativa não selecionada.',
    }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return {
      ok: false,
      status: 400,
      error: profileError.message,
    }
  }

  if (!profile?.id) {
    return {
      ok: false,
      status: 403,
      error: 'Perfil do usuário logado não encontrado.',
    }
  }

  if (profile.is_active_global === false) {
    return {
      ok: false,
      status: 403,
      error: 'Usuário globalmente inativo.',
    }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) {
    return {
      ok: false,
      status: 400,
      error: membershipError.message,
    }
  }

  if (!membership?.company_id) {
    return {
      ok: false,
      status: 403,
      error: 'Usuário sem vínculo ativo com a empresa.',
    }
  }

  if (membership.role !== 'admin') {
    return {
      ok: false,
      status: 403,
      error:
        'Apenas administradores podem configurar o método comercial.',
    }
  }

  return {
    ok: true,
    companyId: membership.company_id,
    userId: user.id,
    supabase,
  }
}