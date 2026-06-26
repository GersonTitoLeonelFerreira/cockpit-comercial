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

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
}

type GroupRow = {
  id: string
  name: string
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

function getProfileLabel(profile: ProfileRow | undefined, fallbackId: string) {
  const fullName = profile?.full_name?.trim()

  if (fullName) {
    return fullName
  }

  const email = profile?.email?.trim()

  if (email) {
    return email
  }

  return `Usuário ${fallbackId.slice(0, 8)}`
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
  return cycle.won_at ?? cycle.lost_at ?? cycle.closed_at ?? cycle.created_at
}

function getCycleResponsibleOwnerId(cycle: LeadCycle) {
  if (cycle.status === 'ganho') {
    return cycle.won_owner_user_id ?? cycle.owner_user_id
  }

  if (cycle.status === 'perdido') {
    return cycle.lost_owner_user_id ?? cycle.owner_user_id
  }

  return cycle.owner_user_id
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function getCycleOutcomeLabel(cycle: LeadCycle) {
  if (cycle.status === 'ganho') {
    if (cycle.won_total !== null && Number.isFinite(cycle.won_total)) {
      return `Venda: ${formatCurrency(cycle.won_total)}`
    }

    return 'Venda ganha'
  }

  if (cycle.status === 'perdido') {
    const reason = cycle.lost_reason?.trim()

    return reason ? `Motivo: ${reason}` : 'Perda sem motivo informado'
  }

  const nextAction = cycle.next_action?.trim()

  return nextAction ? `Próxima ação: ${nextAction}` : 'Em andamento'
}

function getCycleDateLabel(cycle: LeadCycle) {
  if (cycle.status === 'ganho') {
    return `Ganho em ${fmtDateShort(
      cycle.won_at ?? cycle.closed_at ?? cycle.updated_at,
    )}`
  }

  if (cycle.status === 'perdido') {
    return `Perdido em ${fmtDateShort(
      cycle.lost_at ?? cycle.closed_at ?? cycle.updated_at,
    )}`
  }

  return `Criada em ${fmtDateShort(cycle.created_at)}`
}

function getCycleOriginLabel(
  cycle: LeadCycle,
  cyclesById: Map<string, LeadCycle>,
) {
  if (!cycle.origin_cycle_id) {
    return 'Cadastro original'
  }

  const originCycle = cyclesById.get(cycle.origin_cycle_id)

  if (!originCycle) {
    return 'Oportunidade anterior'
  }

  return `${statusLabel(originCycle.status)} · ${fmtDateShort(
    getOpportunityReferenceDate(originCycle),
  )}`
}

function OpportunityCardMeta({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: '7px 8px',
        borderRadius: 8,
        border: `1px solid ${DS.borderSubtle}`,
        background: 'rgba(9,11,15,0.46)',
      }}
    >
      <div
        style={{
          color: DS.textMuted,
          fontSize: 9,
          fontWeight: 850,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 3,
        }}
      >
        {label}
      </div>

      <div
        title={value}
        style={{
          color: DS.textSecondary,
          fontSize: 11,
          fontWeight: 650,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {value}
      </div>
    </div>
  )
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

  const responsibleUserIds = Array.from(
    new Set(
      cycles
        .flatMap((cycle) => [
          cycle.owner_user_id,
          cycle.won_owner_user_id,
          cycle.lost_owner_user_id,
        ])
        .filter((userId): userId is string => Boolean(userId)),
    ),
  )

  let responsibleProfiles: ProfileRow[] = []

  if (responsibleUserIds.length > 0) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', responsibleUserIds)

    responsibleProfiles = (data ?? []) as ProfileRow[]
  }

  const profileNameById = new Map(
    responsibleProfiles.map((profile) => [
      profile.id,
      getProfileLabel(profile, profile.id),
    ]),
  )

  const groupIds = Array.from(
    new Set(
      cycles
        .map((cycle) => cycle.current_group_id)
        .filter((groupId): groupId is string => Boolean(groupId)),
    ),
  )

  let groups: GroupRow[] = []

  if (groupIds.length > 0) {
    const { data } = await supabase
      .from('lead_groups')
      .select('id, name')
      .eq('company_id', activeCompanyId)
      .in('id', groupIds)
      .is('archived_at', null)

    groups = (data ?? []) as GroupRow[]
  }

  const groupNameById = new Map(
    groups.map((group) => [group.id, group.name]),
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
profileNameById,
groupNameById,
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
profileNameById,
groupNameById,
  } = await getLeadPageData(leadId, requestedOpportunityId)

  const selectedProduct = selectedCycle.products ?? null
  const selectedBadgeStyle = statusBadgeStyle(selectedCycle.status)
  const selectedCycleIsClosed =
  selectedCycle.status === 'ganho' ||
  selectedCycle.status === 'perdido'

const cyclesById = new Map(
  cycles.map((cycle) => [cycle.id, cycle]),
)

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

  const responsibleOwnerId = getCycleResponsibleOwnerId(cycle)

  const responsibleLabel = responsibleOwnerId
    ? profileNameById.get(responsibleOwnerId) ??
      'Responsável não informado'
    : cycle.status === 'novo'
      ? 'Pool'
      : 'Sem responsável definido'

  const groupLabel = cycle.current_group_id
    ? groupNameById.get(cycle.current_group_id) ??
      'Grupo não informado'
    : 'Sem grupo'

  const originLabel = getCycleOriginLabel(cycle, cyclesById)
  const outcomeLabel = getCycleOutcomeLabel(cycle)
  const dateLabel = getCycleDateLabel(cycle)

  const outcomeColor =
    cycle.status === 'ganho'
      ? '#86efac'
      : cycle.status === 'perdido'
        ? '#fca5a5'
        : DS.textSecondary

  return (
    <Link
      key={cycle.id}
      href={`/leads/${lead.id}?opportunity=${cycle.id}`}
      style={{
        textDecoration: 'none',
        border: `1px solid ${
          isSelected
            ? 'rgba(59,130,246,0.50)'
            : DS.border
        }`,
        background: isSelected
          ? 'rgba(59,130,246,0.08)'
          : DS.surfaceBg,
        borderRadius: 12,
        padding: '12px',
        display: 'grid',
        gap: 9,
        minWidth: 0,
        boxShadow: isSelected
          ? '0 0 0 1px rgba(59,130,246,0.10)'
          : 'none',
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
        title={productName}
        style={{
          color: DS.textPrimary,
          fontSize: 13,
          fontWeight: 850,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {productName}
      </div>

      <div
        title={outcomeLabel}
        style={{
          color: outcomeColor,
          fontSize: 11,
          fontWeight: 700,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {outcomeLabel}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 7,
        }}
      >
        <OpportunityCardMeta
          label="Responsável"
          value={responsibleLabel}
        />

        <OpportunityCardMeta
          label="Grupo"
          value={groupLabel}
        />

        <OpportunityCardMeta
          label="Origem"
          value={originLabel}
        />

        <OpportunityCardMeta
          label="Registro"
          value={dateLabel}
        />
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
