import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

import { getAuthedSupabase } from '@/app/lib/supabase/server'

type ActiveCompanyAdminError = {
  ok: false
  status: number
  error: string
}

type ActiveCompanyAdminContext = {
  ok: true
  companyId: string
  userId: string
  admin: ReturnType<typeof createClient>
}

export type RequireActiveCompanyAdminResult = ActiveCompanyAdminContext | ActiveCompanyAdminError

export async function requireActiveCompanyAdmin(): Promise<RequireActiveCompanyAdminResult> {
  const authContext = await getAuthedSupabase().catch(() => null)

  if (!authContext) {
    return { ok: false, status: 401, error: 'Não autenticado.' }
  }

  const { supabase, user } = authContext
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    return { ok: false, status: 400, error: 'Empresa ativa não selecionada.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return { ok: false, status: 400, error: profileError.message }
  }

  if (!profile?.id || profile.is_active_global === false) {
    return { ok: false, status: 403, error: 'Usuário globalmente inativo ou sem perfil válido.' }
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) {
    return { ok: false, status: 400, error: membershipError.message }
  }

  if (!membership?.company_id || membership.role !== 'admin') {
    return { ok: false, status: 403, error: 'Apenas admin pode administrar integrações do Pool.' }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    return {
      ok: false,
      status: 500,
      error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
    }
  }

  return {
    ok: true,
    companyId: membership.company_id,
    userId: user.id,
    admin: createClient(url, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  }
}
