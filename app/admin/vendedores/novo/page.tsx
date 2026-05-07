import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import NovoVendedorClient from './ui/NovoVendedorClient'

export const metadata = {
  title: 'Cadastrar Vendedor | Cockpit Comercial',
}

export default async function AdminVendedoresNovoPage() {
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    redirect('/select-company')
  }

  const supabase = createServerClient(
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
          } catch {}
        },
      },
    },
  )

  const { data } = await supabase.auth.getUser()

  if (!data?.user?.id) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', data.user.id)
    .maybeSingle()

  if (profileError || !profile?.id) {
    redirect('/login')
  }

  if (profile.is_active_global === false) {
    redirect('/login')
  }

  const { data: membership, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', data.user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError || !membership) {
    redirect('/select-company')
  }

  if (membership.role !== 'admin') {
    redirect('/leads')
  }

  return (
    <div style={{ padding: 30, color: 'white', maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>Cadastrar vendedor</h1>
      <NovoVendedorClient />
    </div>
  )
}