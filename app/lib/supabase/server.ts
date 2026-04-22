import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

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
    },
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