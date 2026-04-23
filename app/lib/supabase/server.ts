import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type ProfileRow = {
  id: string
  company_id: string | null
  role: string | null
  is_active: boolean | null
  is_platform_admin: boolean | null
}

/**
 * Client Supabase server-side usando cookies de sessão do usuário.
 * Respeita RLS. Use para operações feitas "no nome" do usuário logado.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Em alguns contextos (Server Components) não é possível setar cookies.
          }
        },
      },
    }
  )
}

/**
 * Helper: retorna o client server-side já com o user autenticado validado.
 * Lança erro se não houver sessão. Use em rotas de API que exigem login.
 */
export async function getAuthedSupabase() {
  const supabase = await createSupabaseServerClient()

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user?.id) {
    throw new Error('Não autenticado.')
  }

  return { supabase, user: data.user }
}

/**
 * Helper: carrega o profile do usuário autenticado.
 */
export async function getAuthedProfile() {
  const { supabase, user } = await getAuthedSupabase()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, company_id, role, is_active, is_platform_admin')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  if (!profile) {
    throw new Error('Perfil do usuário logado não encontrado.')
  }

  return {
    supabase,
    user,
    profile: profile as ProfileRow,
  }
}

/**
 * Helper: garante que o usuário logado é platform admin.
 */
export async function ensurePlatformAdmin() {
  const ctx = await getAuthedProfile()

  if (ctx.profile.is_active === false) {
    throw new Error('Usuário inativo.')
  }

  if (ctx.profile.is_platform_admin !== true) {
    throw new Error('Acesso negado (platform admin only).')
  }

  return ctx
}