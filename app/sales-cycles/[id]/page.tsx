import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

export default async function SalesCycleCompatibilityRedirect({
  params,
}: {
  params: Promise<{ id: string }>
}) {
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
        setAll() {},
      },
    },
  )

  const { data: auth } = await supabase.auth.getUser()

  if (!auth?.user) {
    redirect('/login')
  }

  const activeCompanyId =
    cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    redirect('/leads')
  }

  const { data: cycle } = await supabase
    .from('sales_cycles')
    .select('id, lead_id')
    .eq('id', id)
    .eq('company_id', activeCompanyId)
    .maybeSingle()

  if (!cycle?.lead_id) {
    redirect('/leads')
  }

  redirect(`/leads/${cycle.lead_id}?opportunity=${cycle.id}`)
}