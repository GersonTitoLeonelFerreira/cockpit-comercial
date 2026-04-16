import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import CyclePageTabs from './CyclePageTabs'
import ConversationCopilot from './components/ConversationCopilot'
import {
  type CycleEvent,
  statusLabel,
  fmtDateShort,
  statusBadgeStyle,
  getEventTitle,
  MONOSPACE_FONT,
  DAYS_STALE_THRESHOLD,
  MILLISECONDS_PER_DAY,
} from './cycle-event-helpers'

async function getSalesCycleDetail(cycleId: string) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) redirect('/login')

  const { data: cycleData, error: cycleErr } = await supabase
    .from('sales_cycles')
    .select(`
      *,
      leads:lead_id (id, name, phone, email),
      products:product_id (id, name, category)
    `)
    .eq('id', cycleId)
    .single()

  if (cycleErr || !cycleData) redirect('/leads')

  const { data: eventsData } = await supabase
    .from('cycle_events')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('occurred_at', { ascending: false })

  const { data: leadProfile } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('lead_id', cycleData.lead_id)
    .eq('company_id', cycleData.company_id)
    .maybeSingle()

  // Fetch active group for this cycle (protected)
  let activeGroupName: string | null = null
  try {
    const { data: groupCycle } = await supabase
      .from('lead_group_cycles')
      .select('lead_groups:group_id(name)')
      .eq('cycle_id', cycleId)
      .is('detached_at', null)
      .maybeSingle()
    if (groupCycle) {
      const lg = groupCycle.lead_groups as { name?: string } | null
      activeGroupName = lg?.name ?? null
    }
  } catch (e) {
    // non-blocking — group name is optional
    console.error('Failed to fetch active group for cycle:', e)
  }

  return {
    cycle: cycleData,
    events: (eventsData || []) as CycleEvent[],
    leadProfile: leadProfile ?? null,
    activeGroupName,
  }
}

export default async function SalesCycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cycle, events, leadProfile, activeGroupName } = await getSalesCycleDetail(id)

  const lead = cycle.leads as { name?: string; phone?: string; email?: string } | null
  const product = cycle.products as { id?: string; name?: string; category?: string } | null
  const daysInStatus = cycle.stage_entered_at
    ? Math.floor((Date.now() - new Date(cycle.stage_entered_at as string).getTime()) / MILLISECONDS_PER_DAY)
    : null
  const lastEvent = events.length > 0 ? events[0] : null
  const badgeStyle = statusBadgeStyle(cycle.status as string)

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f14', padding: '24px 28px' }}>
      {/* HEADER EXECUTIVO */}
      <div style={{
        background: '#1e1e2e',
        border: '1px solid #2a2a3e',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 20,
      }}>
        <Link
          href="/leads"
          style={{ color: '#60a5fa', fontSize: 13, textDecoration: 'none', fontWeight: 500, display: 'inline-block', marginBottom: 8, opacity: 0.8 }}
        >
          ← Voltar ao Pipeline
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h1 style={{ color: '#f1f5f9', fontWeight: 800, fontSize: '1.8rem', margin: 0, lineHeight: 1.1 }}>
            {lead?.name ?? '—'}
          </h1>
          <span style={{
            ...badgeStyle,
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
          }}>
            {statusLabel(cycle.status as string)}
          </span>
          {activeGroupName && (
            <span style={{
              background: 'rgba(167,139,250,0.1)',
              color: '#a78bfa',
              border: '1px solid rgba(167,139,250,0.3)',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
            }}>
              {activeGroupName}
            </span>
          )}
          {product?.name && (
            <span style={{
              background: 'rgba(96,165,250,0.1)',
              color: '#60a5fa',
              border: '1px solid rgba(96,165,250,0.3)',
              borderRadius: 20,
              padding: '3px 10px',
              fontSize: 11,
              fontWeight: 600,
            }}>
              {product.name}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 6, flexWrap: 'wrap' }}>
          {lead?.phone && (
            <span style={{ color: '#8b8fa2', fontSize: 12 }}>{lead.phone}</span>
          )}
          {product?.category && (
            <span style={{ color: '#6b7280', fontSize: 12 }}>{product.category}</span>
          )}
          {cycle.created_at && (
            <span style={{ color: '#6b7280', fontSize: 12 }}>
              Criado em {fmtDateShort(cycle.created_at as string)}
            </span>
          )}
          <span
            style={{
              color: '#4b5563',
              fontSize: 10,
              fontFamily: MONOSPACE_FONT,
              userSelect: 'all' as const,
              cursor: 'text',
            }}
            title={cycle.id}
          >
            #{(cycle.id as string).slice(0, 8)}
          </span>
        </div>
      </div>

      {/* MINI-CARDS DE CONTEXTO RÁPIDO */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}>
        <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Status</div>
          <span style={{ ...badgeStyle, borderRadius: 20, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>
            {statusLabel(cycle.status as string)}
          </span>
        </div>
        <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Tempo parado</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: daysInStatus != null && daysInStatus > DAYS_STALE_THRESHOLD ? '#f87171' : '#f1f5f9' }}>
            {daysInStatus != null ? `${daysInStatus} dia${daysInStatus !== 1 ? 's' : ''}` : '—'}
          </div>
        </div>
        <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Próxima ação</div>
          {cycle.next_action ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fde68a', marginBottom: 2 }}>{cycle.next_action as string}</div>
              {cycle.next_action_date && (
                <div style={{ fontSize: 11, color: '#8b8fa2' }}>{fmtDateShort(cycle.next_action_date as string)}</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#fde68a', opacity: 0.7 }}>Sem ação definida</div>
          )}
        </div>
        <div style={{ background: '#1e1e2e', border: '1px solid #2a2a3e', borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Última movimentação</div>
          {lastEvent ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{getEventTitle(lastEvent)}</div>
              <div style={{ fontSize: 11, color: '#8b8fa2', marginTop: 2 }}>{fmtDateShort(lastEvent.occurred_at)}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#8b8fa2' }}>Sem movimentação</div>
          )}
        </div>
      </div>

            {/* COPILOTO COMERCIAL */}
            <div style={{ marginBottom: 24 }}>
        <ConversationCopilot cycle={cycle as any} />
      </div>

      {/* ABAS OPERACIONAIS */}
      <CyclePageTabs
        cycle={cycle}
        events={events}
        leadProfile={leadProfile}
        companyId={cycle.company_id as string}
      />
    </div>
  )
}
