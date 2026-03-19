import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import SellerEditClient from './ui/SellerEditClient'

export const metadata = {
  title: 'Editar vendedor | Cockpit Comercial',
}

export default async function AdminVendedorPage({ params }: { params: Promise<{ id: string }> }) {
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
    .select('role')
    .eq('id', data.user.id)
    .single()

  if (!profile || profile.role !== 'admin') redirect('/leads')

  const { id } = await params

  return (
    <div className="mx-auto w-full max-w-[1100px] px-4 py-6 lg:px-8">
      <SellerEditClient sellerId={id} />
    </div>
  )
}