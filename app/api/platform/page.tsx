import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import ConfiguracoesClient from '../../platform/ConfiguracoesClient'

export const metadata = {
  title: 'Configurações | Cockpit Comercial',
}

export default async function ConfiguracoesPage() {
  const cookieStore = await cookies()

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
  if (!auth?.user?.id) redirect('/login')

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('full_name, role, company_id')
    .eq('id', auth.user.id)
    .single()

  if (profErr || !profile?.company_id) redirect('/login')

  let company: any = null

  if (profile.role === 'admin') {
    const { data: companyData } = await supabase
      .from('companies')
      .select('id, name, legal_name, trade_name, cnpj, segment, email, phone, city, state, cep, address')
      .eq('id', profile.company_id)
      .single()

    company = companyData
  }

  return (
    <ConfiguracoesClient
      userId={auth.user.id}
      userEmail={auth.user.email ?? ''}
      userRole={profile.role ?? null}
      profile={profile}
      company={company}
    />
  )
}   