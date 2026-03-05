import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import UsuariosClient from './UsuariosClient'

export default async function AdminUsuariosPage() {
  const cookieStore = await cookies()

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
    }
  )

  const { data } = await supabase.auth.getUser()
  if (!data?.user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('id', data.user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/leads')

  return (
    <div style={{ padding: 30 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 20 }}>
        Cadastro de Usuários
      </h1>
      <UsuariosClient companyId={profile.company_id} />
    </div>
  )
}
