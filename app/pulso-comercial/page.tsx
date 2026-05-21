import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import PulsoComercialClient from './PulsoComercialClient'
import { buildSalesPulsePageData } from '@/app/lib/services/sales-pulse'
import type { SalesPulseCycleRow } from '@/app/types/sales-pulse'

async function getPulsoComercialData() {
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

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

  const { data: auth } = await supabase.auth.getUser()

  if (!auth?.user) redirect('/login')
  if (!activeCompanyId) redirect('/select-company')

  const { data, error } = await supabase
    .from('sales_cycles')
    .select(`
      id,
      company_id,
      lead_id,
      owner_user_id,
      status,
      previous_status,
      stage_entered_at,
      next_action,
      next_action_date,
      current_group_id,
      created_at,
      updated_at,
      closed_at,
      won_at,
      lost_at,
      lost_reason,
      leads:lead_id (id, name, phone, email)
    `)
    .eq('company_id', activeCompanyId)
    .in('status', ['novo', 'contato', 'respondeu', 'negociacao', 'pausado'])
    .order('updated_at', { ascending: true })
    .limit(250)

  if (error) {
    throw new Error(`Erro ao carregar Pulso Comercial: ${error.message}`)
  }

  return buildSalesPulsePageData((data ?? []) as SalesPulseCycleRow[], { limit: 80 })
}

export default async function PulsoComercialPage() {
  const data = await getPulsoComercialData()

  return <PulsoComercialClient data={data} />
}
