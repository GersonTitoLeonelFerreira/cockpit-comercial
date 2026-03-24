import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import ProdutosClient from './ProdutosClient'

export const metadata = {
  title: 'Catálogo de Produtos | Cockpit Comercial',
}

export default async function AdminProdutosPage() {
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
    },
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
    <div className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-8">
      <h1 className="text-2xl font-bold text-white mb-4">Catálogo de Produtos</h1>
      <ProdutosClient companyId={profile.company_id} />
    </div>
  )
}
