import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import GruposClient from './GruposClient'

export default async function GruposPage() {
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
    }
  )

  const { data: auth, error: authErr } = await supabase.auth.getUser()
  const user = auth?.user

  if (authErr || !user?.id) redirect('/login')

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (profErr || !profile?.company_id || profile.role !== 'admin') redirect('/login')

  return <GruposClient companyId={profile.company_id} userId={user.id} />
}