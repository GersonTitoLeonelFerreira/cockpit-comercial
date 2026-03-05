import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import ProfileClient from './ProfileClient'

export default async function PerfilPage() {
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
          // Server Component: não persiste cookie aqui
        },
      },
    }
  )

  const { data: auth, error: authErr } = await supabase.auth.getUser()
  if (authErr || !auth?.user?.id) redirect('/login')

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('id, company_id, role, full_name, email, job_title, status, username, birth_date, cpf, phone, user_code')
    .eq('id', auth.user.id)
    .single()

  if (profErr || !profile?.company_id) redirect('/login')

  return <ProfileClient userId={auth.user.id} authEmail={auth.user.email ?? ''} initialProfile={profile as any} />
}
