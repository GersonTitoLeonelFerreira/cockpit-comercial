import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import CyclePageTabs from '@/app/sales-cycles/[id]/CyclePageTabs'
import CopilotTogglePanel from '@/app/sales-cycles/[id]/components/CopilotTogglePanel'
import CyclePulsePanel from '@/app/sales-cycles/[id]/components/CyclePulsePanel'
import SuccessorOpportunityAction from '@/app/sales-cycles/[id]/components/SuccessorOpportunityAction'
import {
  fmtDateShort,
  statusBadgeStyle,
  statusLabel,
  type CycleEvent,
} from '@/app/sales-cycles/[id]/cycle-event-helpers'
import {
  OPEN_STATUSES,
  type OpportunityType,
  type SalesCycle,
} from '@/app/types/sales_cycles'

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

type LeadRow = {
  id: string
  company_id: string
  name: string | null
  phone: string | null
  email: string | null
  deleted_at: string | null
}

type ProductRelation = {
  id?: string
  name?: string | null
  category?: string | null
}

type LeadCycle = SalesCycle & {
  products?: ProductRelation | null
}

type LeadHistoryEvent = CycleEvent & {
  cycle_id: string
}

type OpportunityTypeLabel = Record<OpportunityType, string>

const OPPORTUNITY_TYPE_LABELS: OpportunityTypeLabel = {
  reativacao: 'Reativação',
  renovacao: 'Renovação',
  recompra: 'Recompra',
  upgrade: 'Upgrade',
  novo_produto: 'Novo produto',
}

function getOpportunityLabel(cycle: LeadCycle) {
  if (!cycle.origin_cycle_id) {
    return 'Oportunidade original'
  }

  return (
    OPPORTUNITY_TYPE_LABELS[
      cycle.opportunity_type as OpportunityType
    ] ?? 'Nova oportunidade'
  )
}

function getOpportunityReferenceDate(cycle: LeadCycle) {
  return cycle.won_at ?? cycle.lost_at ?? cycle.created_at
}

async function getLeadPageData(
  leadId: string,
  requestedOpportunityId: string | null,
) {
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

  const { data: leadData, error: leadError } = await supabase
    .from('leads')
    .select('id, company_id, name, phone, email, deleted_at')
    .eq('id', leadId)
    .eq('company_id', activeCompanyId)
    .maybeSingle()

  if (leadError || !leadData) {
    redirect('/leads')
  }

  const lead = leadData as LeadRow

  if (lead.deleted_at) {
    redirect('/leads')
  }

  const { data: cyclesData, error: cyclesError } = await supabase
    .from('sales_cycles')
    .select(`
      *,
      products:product_id (
        id,
        name,
        category
      )
    `)
    .eq('company_id', activeCompanyId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })

  if (cyclesError || !cyclesData || cyclesData.length === 0) {
    redirect('/leads')
  }

  const cycles = cyclesData as LeadCycle[]

  const selectedCycle =
    cycles.find((cycle) => cycle.id === requestedOpportunityId) ??
    cycles.find((cycle) => OPEN_STATUSES.includes(cycle.status)) ??
    cycles[0]

  if (!selectedCycle) {
    redirect('/leads')
  }

  const cycleIds = cycles.map((cycle) => cycle.id)

  const { data: eventsData } = await supabase
    .from('cycle_events')
    .select('*')
    .eq('company_id', activeCompanyId)
    .in('cycle_id', cycleIds)
    .order('occurred_at', { ascending: false })

  const allLeadEvents = (eventsData ?? []) as LeadHistoryEvent[]

  const selectedCycleEvents = allLeadEvents.filter(
    (event) => event.cycle_id === selectedCycle.id,
  )

  const { data: leadProfile } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('lead_id', leadId)
    .eq('company_id', activeCompanyId)
    .maybeSingle()

  const { data: groupCycle } = await supabase
    .from('lead_group_cycles')
    .select('lead_groups:group_id(name)')
    .eq('cycle_id', selectedCycle.id)
    .is('detached_at', null)
    .maybeSingle()

  const groupRelation = groupCycle?.lead_groups as
    | { name?: string }
    | null
    | undefined

  return {
    lead,
    cycles,
    selectedCycle,
    selectedCycleEvents,
    allLeadEvents,
    leadProfile: leadProfile ?? null,
    activeGroupName: groupRelation?.name ?? null,
  }
}

export default async function LeadDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ opportunity?: string | string[] }>
}) {
  const { id: leadId } = await params
  const resolvedSearchParams = await searchParams

  const requestedOpportunityId = Array.isArray(
    resolvedSearchParams.opportunity,
  )
    ? resolvedSearchParams.opportunity[0] ?? null
    : resolvedSearchParams.opportunity ?? null

  const {
    lead,
    cycles,
    selectedCycle,
    selectedCycleEvents,
    allLeadEvents,
    leadProfile,
    activeGroupName,
  } = await getLeadPageData(leadId, requestedOpportunityId)

  const selectedProduct = selectedCycle.products ?? null
  const selectedBadgeStyle = statusBadgeStyle(selectedCycle.status)
  const selectedCycleIsClosed =
    selectedCycle.status === 'ganho' ||
    selectedCycle.status === 'perdido'

  const selectedCycleWithLead = {
    ...selectedCycle,
    leads: {
      id: lead.id,
      name: lead.name,
      phone: lead.phone,
      email: lead.email,
      deleted_at: lead.deleted_at,
    },
  }

  const copilotCycle = {
    ...selectedCycleWithLead,
    leads: {
      id: lead.id,
      name: lead.name ?? undefined,
      phone: lead.phone,
      email: lead.email,
    },
  }


  return (
    <div
      style={{
        minHeight: '100vh',
        background: DS.contentBg,
        color: DS.textPrimary,
        padding: '24px 28px 36px',
      }}
    >
      <section
        style={{
          background: DS.panelBg,
          border: `1px solid ${DS.border}`,
          borderRadius: 16,
          padding: '20px 24px',
          marginBottom: 14,
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <h1
                style={{
                  color: DS.textPrimary,
                  fontWeight: 800,
                  fontSize: '1.8rem',
                  margin: 0,
                  lineHeight: 1.1,
                }}
              >
                {lead.name ?? '—'}
              </h1>

              <span
                style={{
                  ...selectedBadgeStyle,
                  borderRadius: 999,
                  padding: '4px 12px',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {statusLabel(selectedCycle.status)}
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

              {selectedProduct?.name && (
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
                  {selectedProduct.name}
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
              {lead.phone && <span>{lead.phone}</span>}
              {lead.email && <span>{lead.email}</span>}
              {selectedProduct?.category && (
                <span>{selectedProduct.category}</span>
              )}
              <span>
                Oportunidade selecionada criada em{' '}
                {fmtDateShort(selectedCycle.created_at)}
              </span>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          background: DS.panelBg,
          border: `1px solid ${DS.border}`,
          borderRadius: 16,
          padding: 16,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <div>
            <div
              style={{
                color: DS.blue,
                fontSize: 10,
                fontWeight: 900,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              Oportunidades do lead
            </div>

            <div
              style={{
                color: DS.textSecondary,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              Todas as vendas, perdas, reativações e negociações deste mesmo lead.
            </div>
          </div>

          <span
            style={{
              border: `1px solid ${DS.border}`,
              borderRadius: 999,
              padding: '5px 9px',
              color: DS.textSecondary,
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {cycles.length} oportunidade{cycles.length === 1 ? '' : 's'}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
          }}
        >
          {cycles.map((cycle) => {
            const isSelected = cycle.id === selectedCycle.id
            const badgeStyle = statusBadgeStyle(cycle.status)
            const productName =
              cycle.products?.name ?? 'Produto não informado'

            return (
              <Link
                key={cycle.id}
                href={`/leads/${lead.id}?opportunity=${cycle.id}`}
                style={{
                  textDecoration: 'none',
                  border: `1px solid ${
                    isSelected
                      ? 'rgba(59,130,246,0.45)'
                      : DS.border
                  }`,
                  background: isSelected
                    ? 'rgba(59,130,246,0.08)'
                    : DS.surfaceBg,
                  borderRadius: 12,
                  padding: '11px 12px',
                  display: 'grid',
                  gap: 6,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 8,
                  }}
                >
                  <span
                    style={{
                      color: isSelected
                        ? DS.blueSoft
                        : DS.textSecondary,
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {getOpportunityLabel(cycle)}
                  </span>

                  <span
                    style={{
                      ...badgeStyle,
                      borderRadius: 999,
                      padding: '3px 7px',
                      fontSize: 9,
                      fontWeight: 800,
                      flexShrink: 0,
                    }}
                  >
                    {statusLabel(cycle.status)}
                  </span>
                </div>

                <div
                  style={{
                    color: DS.textPrimary,
                    fontSize: 13,
                    fontWeight: 800,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={productName}
                >
                  {productName}
                </div>

                <div
                  style={{
                    color: DS.textMuted,
                    fontSize: 11,
                  }}
                >
                  {fmtDateShort(getOpportunityReferenceDate(cycle))}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {selectedCycleIsClosed && (
        <div style={{ marginBottom: 14 }}>
          <SuccessorOpportunityAction
            sourceCycleId={selectedCycle.id}
            leadId={lead.id}
          />
        </div>
      )}


      <section
        style={{
          background: 'rgba(59,130,246,0.05)',
          border: `1px solid ${DS.borderSubtle}`,
          borderRadius: 12,
          padding: '11px 13px',
          marginBottom: 14,
          color: DS.textSecondary,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        Abaixo ficam os dados e as ações da oportunidade selecionada. O histórico
        completo do lead permanece acima e não muda quando você troca de oportunidade.
      </section>

      <div style={{ display: 'grid', gap: 14 }}>
        <CyclePulsePanel
          cycle={selectedCycleWithLead}
          lead={selectedCycleWithLead.leads}
          variant="compact"
        />

        <CopilotTogglePanel cycle={copilotCycle} />

        <div
          style={{
            background: DS.panelBg,
            border: `1px solid ${DS.border}`,
            borderRadius: 16,
            padding: 16,
          }}
        >
          <CyclePageTabs
            cycle={selectedCycleWithLead}
            events={selectedCycleEvents}
            historyEvents={allLeadEvents}
            leadProfile={leadProfile}
            companyId={selectedCycle.company_id}
          />
        </div>
      </div>
    </div>
  )
}