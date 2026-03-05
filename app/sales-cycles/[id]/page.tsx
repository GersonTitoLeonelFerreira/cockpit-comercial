import { cookies } from 'next/headers'
import { redirect, notFound } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import Link from 'next/link'
import SalesCycleDetail from './SalesCycleDetail'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function SalesCycleDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const cycleId = params?.id

  if (!cycleId || cycleId === 'undefined') redirect('/sales-cycles')
  if (!UUID_RE.test(cycleId)) notFound()

  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookies()
          return store.getAll()
        },
        async setAll() {
          // Server Component
        },
      },
    }
  )

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.company_id) redirect('/login')

  const companyId = profile.company_id as string

  // Fetch the sales cycle with lead info
  const { data: cycle, error: cycleError } = await supabase
    .from('sales_cycles')
    .select(
      `id, company_id, lead_id, owner_user_id, status,
       next_action, next_action_date, stage_entered_at,
       deal_value, loss_reason, closed_at, created_at, updated_at,
       lead:leads(id, name, phone, email)`
    )
    .eq('id', cycleId)
    .eq('company_id', companyId)
    .single()

  if (cycleError || !cycle) {
    return (
      <div style={{ maxWidth: 800, margin: '60px auto', color: 'white' }}>
        <Link href="/sales-cycles" style={{ color: '#9aa', textDecoration: 'none' }}>
          ← Voltar
        </Link>
        <h1>Ciclo não encontrado</h1>
        <p style={{ opacity: 0.7 }}>{cycleError?.message ?? 'Sem acesso ou ciclo inexistente.'}</p>
      </div>
    )
  }

  // Fetch owner profile
  let ownerName: string | null = null
  if (cycle.owner_user_id) {
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', cycle.owner_user_id)
      .single()
    ownerName = ownerProfile?.full_name ?? ownerProfile?.email ?? cycle.owner_user_id
  }

  // Fetch cycle events
  const { data: events, error: eventsErr } = await supabase
    .from('cycle_events')
    .select('id, cycle_id, company_id, user_id, event_type, from_stage, to_stage, metadata, created_at')
    .eq('cycle_id', cycleId)
    .order('created_at', { ascending: false })
    .limit(80)

  // Fetch sellers for owner assignment (admin only)
  let sellers: Array<{ id: string; full_name: string | null; email: string | null; role: string }> = []
  if (profile.role === 'admin') {
    const { data: sellersData } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .eq('company_id', companyId)
      .in('role', ['seller', 'consultor'])
      .order('full_name', { ascending: true })
    sellers = (sellersData ?? []) as typeof sellers
  }

  void cookieStore // suppress unused warning

  return (
    <SalesCycleDetail
      cycle={cycle as any}
      ownerName={ownerName}
      events={(events ?? []) as any}
      eventsErr={eventsErr?.message ?? null}
      sellers={sellers}
      userId={user.id}
      companyId={companyId}
      isAdmin={profile.role === 'admin'}
    />
  )
}
