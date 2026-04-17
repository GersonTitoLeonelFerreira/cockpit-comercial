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

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
} as const

async function getSalesCycleDetail(cycleId: string) {
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
    console.error('Failed to fetch active group for cycle:', e)
  }

  return {
    cycle: cycleData,
    events: (eventsData || []) as CycleEvent[],
    leadProfile: leadProfile ?? null,
    activeGroupName,
  }
}

function summaryCard(label: string, value: string, tone?: 'default' | 'danger') {
  return {
    label,
    value,
    tone: tone ?? 'default',
  }
}

export default async function SalesCycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { cycle, events, leadProfile, activeGroupName } = await getSalesCycleDetail(id)

  const lead = cycle.leads as { name?: string; phone?: string; email?: string } | null
  const product = cycle.products as { id?: string; name?: string; category?: string } | null
  const daysInStatus = cycle.stage_entered_at
    ? Math.floor((Date.now() - new Date(cycle.stage_entered_at as string).getTime()) / MILLISECONDS_PER_DAY)
    : null
  const lastEvent = events.length > 0 ? events[0] : null
  const badgeStyle = statusBadgeStyle(cycle.status as string)

  const cards = [
    summaryCard('Status', statusLabel(cycle.status as string)),
    summaryCard(
      'Tempo na etapa',
      daysInStatus != null ? `${daysInStatus} dia${daysInStatus !== 1 ? 's' : ''}` : '—',
      daysInStatus != null && daysInStatus > DAYS_STALE_THRESHOLD ? 'danger' : 'default'
    ),
    summaryCard(
      'Próxima ação',
      cycle.next_action
        ? `${String(cycle.next_action)}${cycle.next_action_date ? ` • ${fmtDateShort(cycle.next_action_date as string)}` : ''}`
        : 'Sem ação definida'
    ),
    summaryCard(
      'Última movimentação',
      lastEvent ? `${getEventTitle(lastEvent)} • ${fmtDateShort(lastEvent.occurred_at)}` : 'Sem movimentação'
    ),
  ]

  return (
    <div
      style={{
        minHeight: '100vh',
        background: DS.contentBg,
        color: DS.textPrimary,
        padding: '24px 28px 36px',
      }}
    >
      <div
        style={{
          background: DS.panelBg,
          border: `1px solid ${DS.border}`,
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 18,
        }}
      >
        <Link
          href="/leads"
          style={{
            color: DS.blueSoft,
            fontSize: 13,
            textDecoration: 'none',
            fontWeight: 600,
            display: 'inline-block',
            marginBottom: 10,
          }}
        >
          ← Voltar ao Cockpit
        </Link>

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1
                style={{
                  color: DS.textPrimary,
                  fontWeight: 800,
                  fontSize: '1.8rem',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                {lead?.name ?? '—'}
              </h1>

              <span
                style={{
                  ...badgeStyle,
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {statusLabel(cycle.status as string)}
              </span>

              {activeGroupName && (
                <span
                  style={{
                    background: 'rgba(167,139,250,0.10)',
                    color: '#a78bfa',
                    border: '1px solid rgba(167,139,250,0.25)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {activeGroupName}
                </span>
              )}

              {product?.name && (
                <span
                  style={{
                    background: 'rgba(59,130,246,0.10)',
                    color: DS.blueSoft,
                    border: '1px solid rgba(59,130,246,0.25)',
                    borderRadius: 999,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 700,
                  }}
                >
                  {product.name}
                </span>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                marginTop: 8,
                flexWrap: 'wrap',
                color: DS.textSecondary,
                fontSize: 12,
              }}
            >
              {lead?.phone && <span>{lead.phone}</span>}
              {lead?.email && <span>{lead.email}</span>}
              {product?.category && <span>{product.category}</span>}
              {cycle.created_at && <span>Criado em {fmtDateShort(cycle.created_at as string)}</span>}
              <span
                style={{
                  color: DS.textMuted,
                  fontFamily: MONOSPACE_FONT,
                  userSelect: 'all',
                  cursor: 'text',
                }}
                title={cycle.id}
              >
                #{(cycle.id as string).slice(0, 8)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {cards.map((card) => (
          <div
            key={card.label}
            style={{
              background: DS.panelBg,
              border: `1px solid ${DS.border}`,
              borderRadius: 12,
              padding: '14px 16px',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: DS.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: 8,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: card.tone === 'danger' ? '#fca5a5' : DS.textPrimary,
                lineHeight: 1.4,
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          background: DS.panelBg,
          border: `1px solid ${DS.border}`,
          borderRadius: 16,
          padding: 18,
          marginBottom: 18,
        }}
      >
        <ConversationCopilot cycle={cycle as any} />
      </div>

      <div
        style={{
          background: DS.panelBg,
          border: `1px solid ${DS.border}`,
          borderRadius: 16,
          padding: 18,
        }}
      >
        <CyclePageTabs
          cycle={cycle}
          events={events}
          leadProfile={leadProfile}
          companyId={cycle.company_id as string}
        />
      </div>
    </div>
  )
}