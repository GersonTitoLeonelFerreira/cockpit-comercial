import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import CyclePageTabs from './CyclePageTabs'
import {
  type CycleEvent,
  statusLabel,
  fmtDateShort,
  whatsappLink,
  statusBadgeStyle,
  getEventTitle,
  COLOR_GREEN,
  HEX_ALPHA_LIGHT,
  HEX_ALPHA_MEDIUM,
  MONOSPACE_FONT,
  DAYS_STALE_THRESHOLD,
  MILLISECONDS_PER_DAY,
} from './cycle-event-helpers'

// ---------------------------------------------------------------------------
// Busca dos dados
// ---------------------------------------------------------------------------

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

  // Get cycle with lead data
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

  // Get events
  const { data: eventsData } = await supabase
    .from('cycle_events')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('occurred_at', { ascending: false })

  // Get lead profile
  const { data: leadProfile } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('lead_id', cycleData.lead_id)
    .eq('company_id', cycleData.company_id)
    .maybeSingle()

  return {
    cycle: cycleData,
    events: (eventsData || []) as CycleEvent[],
    leadProfile: leadProfile ?? null,
  }
}

// ---------------------------------------------------------------------------
// Página de detalhe do ciclo — Layout executivo premium
// ---------------------------------------------------------------------------

export default async function SalesCycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cycle, events, leadProfile } = await getSalesCycleDetail(id)

  const lead = cycle.leads as { name?: string; phone?: string; email?: string } | null
  const daysInStatus = cycle.stage_entered_at
    ? Math.floor((Date.now() - new Date(cycle.stage_entered_at as string).getTime()) / MILLISECONDS_PER_DAY)
    : null
  const lastEvent = events.length > 0 ? events[0] : null
  const badgeStyle = statusBadgeStyle(cycle.status as string)
  const waLink = whatsappLink(lead?.phone)

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f14', padding: '24px 28px' }}>

      {/* ── 1. HEADER EXECUTIVO ─────────────────────────────────────────────── */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ color: '#f1f5f9', fontWeight: 800, fontSize: '1.8rem', margin: 0, lineHeight: 1.1 }}>
            {lead?.name ?? '—'}
          </h1>
          {/* Status badge */}
          <span style={{
            ...badgeStyle,
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
          }}>
            {statusLabel(cycle.status as string)}
          </span>
          {/* WhatsApp link */}
          {lead?.phone && (
            waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: COLOR_GREEN,
                  fontSize: 13,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: `${COLOR_GREEN}${HEX_ALPHA_LIGHT}`,
                  border: `1px solid ${COLOR_GREEN}${HEX_ALPHA_MEDIUM}`,
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontWeight: 500,
                }}
              >
                📱 {lead.phone}
              </a>
            ) : (
              <span style={{ color: '#8b8fa2', fontSize: 13 }}>{lead.phone}</span>
            )
          )}
        </div>
        <p style={{ color: '#8b8fa2', fontSize: 12, margin: 0, marginTop: 6 }}>
          Ciclo <span style={{ fontFamily: MONOSPACE_FONT }}>#{cycle.id}</span>
        </p>
      </div>

      {/* ── 2. MINI-CARDS DE CONTEXTO RÁPIDO ───────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}>
        {/* Status */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Status</div>
          <span style={{
            ...badgeStyle,
            borderRadius: 20,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 600,
          }}>
            {statusLabel(cycle.status as string)}
          </span>
        </div>

        {/* Tempo parado */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Tempo parado</div>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: daysInStatus != null && daysInStatus > DAYS_STALE_THRESHOLD ? '#f87171' : '#f1f5f9',
          }}>
            {daysInStatus != null ? `${daysInStatus} dia${daysInStatus !== 1 ? 's' : ''}` : '—'}
          </div>
        </div>

        {/* Próxima ação */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '12px 16px',
        }}>
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

        {/* Última movimentação */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '12px 16px',
        }}>
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

      {/* ── 3. ABAS OPERACIONAIS ────────────────────────────────────────────── */}
      <CyclePageTabs
        cycle={cycle}
        events={events}
        leadProfile={leadProfile}
        companyId={cycle.company_id as string}
      />
    </div>
  )
}