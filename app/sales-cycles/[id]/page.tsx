import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'

import { buildCycleClosingQuery } from '@/app/lib/cycle-closing-link'

export default async function SalesCycleCompatibilityRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  // Pedido de fechamento vindo do Companion (leitura completa): só abre o
  // modal na tela do ciclo. Parâmetros fora da lista são descartados.
  const closingQuery = buildCycleClosingQuery(
    searchParams ? await searchParams : {},
  )
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

  redirect(
    `/leads/${cycle.lead_id}?opportunity=${cycle.id}${closingQuery ? `&${closingQuery}` : ''}`,
  )
}