import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import ConfiguracoesClient from './ConfiguracoesClient'

export const metadata = {
  title: 'Configurações | Cockpit Comercial',
}

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

export default async function ConfiguracoesPage() {
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
        setAll() {},
      },
    },
  )

  const { data: auth } = await supabase.auth.getUser()

  if (!auth?.user?.id) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('full_name, is_active_global')
    .eq('id', auth.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    redirect('/login')
  }

  if (profile.is_active_global === false) {
    redirect('/login')
  }

  const { data: membershipData, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', auth.user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError || !membershipData) {
    redirect('/select-company')
  }

  const membership = membershipData as MembershipRow

  let company = null

  if (membership.role === 'admin') {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceKey) {
      throw new Error('ENV faltando: SUPABASE_SERVICE_ROLE_KEY')
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const { data: companyData, error: companyError } = await admin
      .from('companies')
      .select('id, name, legal_name, trade_name, cnpj, segment, email, phone, city, state, cep, address')
      .eq('id', membership.company_id)
      .maybeSingle()

    if (companyError) {
      throw new Error(companyError.message)
    }

    company = companyData
  }

  return (
    <ConfiguracoesClient
      userId={auth.user.id}
      userEmail={auth.user.email ?? ''}
      userRole={membership.role ?? null}
      profile={{
        full_name: profile.full_name ?? null,
        role: membership.role ?? null,
        company_id: membership.company_id,
      }}
      company={company}
    />
  )
}