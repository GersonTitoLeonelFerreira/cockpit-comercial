import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'

import LeadsClient from './LeadsClient'

export default async function LeadsPage(props: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined

  const ownerParamRaw = searchParams?.owner
  const ownerParam =
    typeof ownerParamRaw === 'string' ? ownerParamRaw : Array.isArray(ownerParamRaw) ? ownerParamRaw[0] : null

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // esta page não precisa escrever cookies
        },
      },
    }
  )

  const { data: auth, error: authErr } = await supabase.auth.getUser()
  const user = auth?.user

  if (authErr || !user?.id) redirect('/login')

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('company_id, role, full_name, email')
    .eq('id', user.id)
    .single()

  // Usuário existe no auth, mas não tem profile ou company -> manda pro login por enquanto
  // (Se quiser, depois criamos /cadastro/complete-profile)
  if (profErr || !profile?.company_id) redirect('/login')

  const role = (profile.role ?? 'member') as string
  const label = (profile.full_name ?? profile.email ?? user.email ?? user.id) as string

  return (
    <LeadsClient
      userId={user.id}
      companyId={profile.company_id}
      role={role}
      userLabel={label}
      defaultOwnerId={ownerParam}
    />
  )
}