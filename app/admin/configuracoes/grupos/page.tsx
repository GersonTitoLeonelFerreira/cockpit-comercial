import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import GruposClient from './GruposClient'

export default async function GruposPage() {
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

  const { data: auth, error: authErr } = await supabase.auth.getUser()
  const user = auth?.user

  if (authErr || !user?.id) {
    redirect('/login')
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', user.id)
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
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError || !membership) {
    redirect('/select-company')
  }

  if (membership.role !== 'admin') {
    redirect('/leads')
  }

  return <GruposClient companyId={membership.company_id} userId={user.id} />
}