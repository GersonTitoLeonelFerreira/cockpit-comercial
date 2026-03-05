import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'
import SalesCyclesKanban from '../components/SalesCyclesKanban'

export default async function SalesCyclesPage() {
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
          // ok
        },
      },
    }
  )

  const { data: auth } = await supabase.auth.getUser()
  const user = auth?.user
  if (!user?.id) redirect('/login')

  const { data: profile, error: profErr } = await supabase
    .from('profiles')
    .select('company_id, role, full_name')
    .eq('id', user.id)
    .single()

  if (profErr || !profile?.company_id) redirect('/login')

  return (
    <div style={{ color: 'white' }}>
      <div style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
        <Link href="/leads" style={{ color: '#9aa', textDecoration: 'none', fontSize: 13 }}>
          ← Pipeline
        </Link>
        {profile.role === 'admin' && (
          <Link href="/pool" style={{ color: '#9aa', textDecoration: 'none', fontSize: 13 }}>
            Pool →
          </Link>
        )}
      </div>

      <SalesCyclesKanban userId={user.id} companyId={profile.company_id as string} />
    </div>
  )
}
