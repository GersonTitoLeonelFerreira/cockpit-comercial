import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect, notFound } from 'next/navigation'
import EditarVendedorClient from './EditarVendedorClient'

export const metadata = {
  title: 'Editar Vendedor | Cockpit Comercial',
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditarVendedorPage({ params }: Props) {
  const { id } = await params
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

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role, company_id')
    .eq('id', data.user.id)
    .single()

  if (!adminProfile || adminProfile.role !== 'admin') redirect('/leads')

  // Carregar dados do vendedor, validando que pertence à mesma company
  const { data: seller } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active, company_id')
    .eq('id', id)
    .eq('company_id', adminProfile.company_id)
    .single()

  if (!seller) notFound()

  return (
    <EditarVendedorClient
      seller={{
        id: seller.id,
        full_name: seller.full_name,
        email: seller.email,
        role: seller.role,
        is_active: seller.is_active ?? true,
      }}
    />
  )
}
