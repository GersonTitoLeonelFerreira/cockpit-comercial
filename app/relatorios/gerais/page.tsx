import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import ReportNavDropdown from '@/app/relatorios/components/ReportNavDropdown'

export const dynamic = 'force-dynamic'

// ==============================================================================
// DESIGN TOKENS — mesmos do shell/kanban
// ==============================================================================
const DS = {
  contentBg: '#090b0f',
  surfaceBg: '#0d1017',
  panelBg: '#101420',
  cardBg: '#141722',
  border: '#1a1d2e',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textLabel: '#6b7fa3',
  textMuted: '#4a5568',
  blueSoft: '#7eb6ff',
  blue: '#3b82f6',
  red: '#ef4444',
  redBg: '#1c0a0a',
  redBorder: '#450a0a',
  green: '#22c55e',
  yellow: '#fbbf24',
  radius: 7,
  radiusContainer: 9,
  shadowCard: '0 2px 12px rgba(0,0,0,0.25)',
}

// ==============================================================================
// Helpers
// ==============================================================================
function formatSeconds(secs: number) {
  const s = Math.max(0, Math.floor(secs || 0))
  const m = Math.floor(s / 60)
  if (m < 1) return '0min'

  const h = Math.floor(m / 60)
  const mm = m % 60
  const d = Math.floor(h / 24)
  const hh = h % 24

  if (d > 0) return `${d}d ${hh}h`
  if (h > 0) return mm > 0 ? `${h}h ${mm}min` : `${h}h`

  return `${m}min`
}

function toDateKey(value: unknown) {
  const raw = String(value ?? '').trim()
  const candidate = raw.split('T')[0].split(' ')[0]

  return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : ''
}

function monthTextToDateKey(value: unknown) {
  const text = String(value ?? '').trim().toLowerCase()

  if (!text) return ''

  const months: Record<string, number> = {
    january: 1,
    jan: 1,
    janeiro: 1,
    february: 2,
    feb: 2,
    fevereiro: 2,
    march: 3,
    mar: 3,
    março: 3,
    marco: 3,
    april: 4,
    apr: 4,
    abril: 4,
    may: 5,
    maio: 5,
    june: 6,
    jun: 6,
    junho: 6,
    july: 7,
    jul: 7,
    julho: 7,
    august: 8,
    aug: 8,
    agosto: 8,
    september: 9,
    sep: 9,
    setembro: 9,
    october: 10,
    oct: 10,
    outubro: 10,
    november: 11,
    nov: 11,
    novembro: 11,
    december: 12,
    dec: 12,
    dezembro: 12,
  }

  const match = text.match(/^([a-zçãé]+)\s+(\d{4})$/i)
  if (!match) return ''

  const month = months[match[1]]
  const year = Number(match[2])

  if (!month || !Number.isFinite(year)) return ''

  return `${year}-${String(month).padStart(2, '0')}-01`
}

function getPeriodStartFromCompetency(activeCompetency: Record<string, unknown>) {
  return (
    toDateKey(activeCompetency.month_start) ||
    toDateKey(activeCompetency.month) ||
    monthTextToDateKey(activeCompetency.month)
  )
}

function formatDateKey(date: Date) {
  const year = String(date.getFullYear())
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function parseDateKey(value: string) {
  const key = toDateKey(value)
  if (!key) return null

  const date = new Date(`${key}T00:00:00`)

  return Number.isNaN(date.getTime()) ? null : date
}

function getMonthEndInclusiveFromStart(start: string) {
  const startDate = parseDateKey(start)
  if (!startDate) return ''

  const lastDay = new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0)

  return formatDateKey(lastDay)
}

function formatDateBR(value: string) {
  const key = toDateKey(value)

  if (!key) return '----'

  const [year, month, day] = key.split('-')

  return `${day}/${month}/${year}`
}

function normalizeFunnelStatus(value: unknown) {
  const status = String(value ?? '').trim().toLowerCase()

  if (status === 'fechado') return 'ganho'
  if (status === 'respondido') return 'respondeu'

  return status
}

function isDefaultBusinessDay(date: Date) {
  const weekday = date.getDay()

  return weekday >= 1 && weekday <= 5
}

function countBusinessDaysInRange(start: string, end: string) {
  const startDate = parseDateKey(start)
  const endDate = parseDateKey(end)

  if (!startDate || !endDate || endDate < startDate) return 0

  let count = 0
  const current = new Date(startDate)

  while (current <= endDate) {
    if (isDefaultBusinessDay(current)) count += 1
    current.setDate(current.getDate() + 1)
  }

  return count
}

function countBusinessDaysUntilToday(start: string, end: string) {
  const startDate = parseDateKey(start)
  const endDate = parseDateKey(end)

  if (!startDate || !endDate || endDate < startDate) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const lastDate = today < endDate ? today : endDate
  if (lastDate < startDate) return 0

  let count = 0
  const current = new Date(startDate)

  while (current <= lastDate) {
    if (isDefaultBusinessDay(current)) count += 1
    current.setDate(current.getDate() + 1)
  }

  return count
}

function countRemainingBusinessDays(end: string) {
  const endDate = parseDateKey(end)
  if (!endDate) return 0

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (endDate < today) return 0

  let count = 0
  const current = new Date(today)

  while (current <= endDate) {
    if (isDefaultBusinessDay(current)) count += 1
    current.setDate(current.getDate() + 1)
  }

  return count
}

// ==============================================================================
// Types
// ==============================================================================

type StageTimeRow = {
  from_stage: string
  moves: number
  avg_seconds: number
  median_seconds: number
}

type ConvRow = {
  step_order: number
  from_stage: string
  to_stage: string
  entered: number
  progressed: number
  conversion: number
}

type LossRow = {
  step_order: number
  stage: string
  lost_to: string
  entered: number
  lost: number
  loss_rate: number
}

type SlaRiskRow = {
  lead_id: string
  name: string
  phone: string | null
  stage: string
  seconds_in_stage: number
  sla_seconds: number
  over_seconds: number
  owner_user_id: string | null
  owner_name: string | null
}

type FunnelStatusRow = {
  status: string
  stage_entered_at: string | null
}

// ==============================================================================
// Table styles
// ==============================================================================

const thStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 10,
  fontWeight: 800,
  color: DS.textLabel,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  borderBottom: `1px solid ${DS.border}`,
  textAlign: 'left',
}

const tdStyle: React.CSSProperties = {
  padding: '10px 8px',
  fontSize: 13,
  color: DS.textSecondary,
  borderBottom: `1px solid ${DS.border}`,
}

const tdBold: React.CSSProperties = {
  ...tdStyle,
  color: DS.textPrimary,
  fontWeight: 700,
}

// ==============================================================================
// Main page
// ==============================================================================

export default async function RelatoriosGeraisPage() {
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
          // Server Component não escreve cookie
        },
      },
    }
  )

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (!user || userErr) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile?.company_id) {
    return (
      <div style={{ width: 900, margin: '80px auto', color: DS.textPrimary }}>
        <h1>Relatórios</h1>
        <p>
          Erro ao buscar seu perfil/empresa:{' '}
          {profileError?.message ?? 'company_id não encontrado'}
        </p>
      </div>
    )
  }

  const companyId = profile.company_id as string

  // --- Conversão ---
  const { data: convData, error: convErr } = await supabase.rpc(
    'report_stage_conversion',
    { p_company_id: companyId }
  )

  const convRows: ConvRow[] = (convData ?? []).map((r: Record<string, unknown>) => ({
    step_order: Number(r.step_order ?? 0),
    from_stage: String(r.from_stage ?? ''),
    to_stage: String(r.to_stage ?? ''),
    entered: Number(r.entered ?? 0),
    progressed: Number(r.progressed ?? 0),
    conversion: Number(r.conversion ?? 0),
  }))

  // --- Perdas ---
  const { data: lossData, error: lossErr } = await supabase.rpc(
    'report_stage_losses',
    { p_company_id: companyId }
  )

  const lossRows: LossRow[] = (lossData ?? []).map((r: Record<string, unknown>) => ({
    step_order: Number(r.step_order ?? 0),
    stage: String(r.stage ?? ''),
    lost_to: String(r.lost_to ?? ''),
    entered: Number(r.entered ?? 0),
    lost: Number(r.lost ?? 0),
    loss_rate: Number(r.loss_rate ?? 0),
  }))

  // --- Gargalo ---
  const { data: timeData, error: timeErr } = await supabase.rpc(
    'report_stage_time_summary',
    { p_company_id: companyId }
  )

  const timeRows: StageTimeRow[] = (timeData ?? []).map((r: Record<string, unknown>) => ({
    from_stage: String(r.from_stage ?? ''),
    moves: Number(r.moves ?? 0),
    avg_seconds: Number(r.avg_seconds ?? 0),
    median_seconds: Number(r.median_seconds ?? 0),
  }))

  // --- SLA / Risco ---
  const { data: slaData, error: slaErr } = await supabase.rpc(
    'report_sla_risk',
    { p_company_id: companyId }
  )

  const slaRows: SlaRiskRow[] = (slaData ?? []).map((r: Record<string, unknown>) => ({
    lead_id: String(r.lead_id ?? ''),
    name: String(r.name ?? ''),
    phone: typeof r.phone === 'string' ? r.phone : null,
    stage: String(r.stage ?? ''),
    seconds_in_stage: Number(r.seconds_in_stage ?? 0),
    sla_seconds: Number(r.sla_seconds ?? 0),
    over_seconds: Number(r.over_seconds ?? 0),
    owner_user_id: typeof r.owner_user_id === 'string' ? r.owner_user_id : null,
    owner_name: typeof r.owner_name === 'string' ? r.owner_name : null,
  }))

  // --- Saúde atual do funil ---
  const { data: cycleStatusData, error: cycleStatusErr } = await supabase
    .from('sales_cycles')
    .select('status, stage_entered_at')
    .eq('company_id', companyId)

  const cycleStatusRows: FunnelStatusRow[] = (cycleStatusData ?? []).map(
    (r: Record<string, unknown>) => ({
      status: normalizeFunnelStatus(r.status),
      stage_entered_at: typeof r.stage_entered_at === 'string' ? r.stage_entered_at : null,
    })
  )

  // --- Referência de meta — contexto secundário do Simulador ---
  const { data: activeCompetencyRaw, error: activeCompetencyErr } = await supabase.rpc(
    'rpc_get_active_competency'
  )

  const activeCompetency = (activeCompetencyRaw ?? {}) as Record<string, unknown>
  const periodStart = getPeriodStartFromCompetency(activeCompetency)
  const periodEnd = getMonthEndInclusiveFromStart(periodStart)
  const hasActivePeriod = Boolean(periodStart && periodEnd)
  const ownerScopeId: string | null = null

  const { data: revenueGoalRaw, error: revenueGoalErr } = hasActivePeriod
    ? await supabase.rpc('rpc_get_revenue_goal', {
        p_company_id: companyId,
        p_owner_id: ownerScopeId,
        p_date_start: periodStart,
        p_date_end: periodEnd,
      })
    : { data: null, error: null }

  const { data: revenueSummaryRaw, error: revenueSummaryErr } = hasActivePeriod
    ? await supabase.rpc('rpc_revenue_summary', {
        p_company_id: companyId,
        p_owner_id: ownerScopeId,
        p_start_date: periodStart,
        p_end_date: periodEnd,
        p_metric: 'faturamento',
      })
    : { data: null, error: null }

  const { data: cycleMetricsRaw, error: cycleMetricsErr } = await supabase.rpc(
    'rpc_get_sales_cycle_metrics_v1',
    {
      p_owner_user_id: ownerScopeId,
      p_month: periodStart || null,
    }
  )

  const revenueGoal = (revenueGoalRaw ?? {}) as Record<string, unknown>
  const revenueSummary = (revenueSummaryRaw ?? {}) as Record<string, unknown>
  const cycleMetrics = (cycleMetricsRaw ?? {}) as Record<string, unknown>

  const metaVal = Number(revenueGoal.goal_value ?? 0)
  const faturReal = Number(revenueSummary.total_real ?? 0)
  const ticketSimulador = Number(revenueGoal.ticket_medio ?? 0)

  const currentWins = Number(cycleMetrics.current_wins ?? 0)
  const workedCount = Number(cycleMetrics.worked_count ?? 0)

  const ticketReal = currentWins > 0 ? Math.round(faturReal / currentWins) : 0
  const ticketParaCalc = ticketSimulador > 0 ? ticketSimulador : ticketReal

  const taxaReal = workedCount > 0 ? currentWins / workedCount : 0

  // O relatório mantém a leitura padrão Planejada do Simulador apenas como contexto.
  // Enquanto a escolha Planejada/Real não for persistida no banco, a referência usa 20%.
  const taxaConversao = 0.2

  const diasUteisTot = hasActivePeriod ? countBusinessDaysInRange(periodStart, periodEnd) : 22
  const diasUteisPass = hasActivePeriod ? countBusinessDaysUntilToday(periodStart, periodEnd) : 0
  const diasUteisRest = hasActivePeriod ? countRemainingBusinessDays(periodEnd) : 0

  const faturDiario = diasUteisPass > 0 ? faturReal / diasUteisPass : 0
  const projecao = faturDiario * diasUteisTot
  const gap = Math.max(0, metaVal - faturReal)
  const progressPct = metaVal > 0 ? (faturReal / metaVal) * 100 : 0
  const projecaoPct = metaVal > 0 ? (projecao / metaVal) * 100 : 0
  const faturNecessarioDia = diasUteisRest > 0 ? gap / diasUteisRest : gap

  const vendasNecessarias = ticketParaCalc > 0 ? Math.ceil(metaVal / ticketParaCalc) : 0
  const vendasRestantes = ticketParaCalc > 0 ? Math.ceil(gap / ticketParaCalc) : 0
  const ciclosRestantes = taxaConversao > 0 ? Math.ceil(vendasRestantes / taxaConversao) : 0
  const ciclosRestantesPorDia = diasUteisRest > 0 ? Math.ceil(ciclosRestantes / diasUteisRest) : 0

  const pacingRatio = metaVal > 0 ? projecao / metaVal : 0
  const statusMeta = pacingRatio >= 1 ? 'no_ritmo' : pacingRatio >= 0.9 ? 'atencao' : 'acelerar'
  const statusColor = statusMeta === 'no_ritmo' ? DS.green : statusMeta === 'atencao' ? DS.yellow : DS.red
  const statusLabelText = statusMeta === 'no_ritmo' ? 'No ritmo' : statusMeta === 'atencao' ? 'Atenção' : 'Acelerar'

  const metaVsRealityError =
    activeCompetencyErr?.message ||
    revenueGoalErr?.message ||
    revenueSummaryErr?.message ||
    cycleMetricsErr?.message ||
    cycleStatusErr?.message ||
    null

  function toBRL(v: number) {
    return (Number(v) || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  }

  const slaCount = slaRows.length
  const stageRiskCounts = slaRows.reduce<Record<string, number>>((acc, r) => {
    acc[r.stage] = (acc[r.stage] ?? 0) + 1
    return acc
  }, {})

  const worstStageByCount =
    Object.entries(stageRiskCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const topRiskLeads = slaRows.slice(0, 50)

  const finalStep = convRows.find(
    (r) => r.from_stage === 'negociacao' && r.to_stage === 'fechado'
  )
  const finalConv = finalStep ? finalStep.conversion : 0

  const worstLoss = lossRows
    .slice()
    .sort((a, b) => (b.loss_rate ?? 0) - (a.loss_rate ?? 0))[0]

  const mostDelayedLead = slaRows[0] ?? null
  const slowestStage = timeRows
    .slice()
    .sort((a, b) => Number(b.avg_seconds ?? 0) - Number(a.avg_seconds ?? 0))[0]

  const hasCriticalSla = slaCount >= 20
  const hasSlaRisk = slaCount > 0
  const hasLossRisk = Boolean(worstLoss && worstLoss.loss_rate >= 30)
  const hasConversionRisk = finalConv > 0 && finalConv < 20

  const operationStatus = hasCriticalSla
    ? 'Operação crítica'
    : hasSlaRisk || hasLossRisk || hasConversionRisk
      ? 'Operação em atenção'
      : 'Operação saudável'

  const operationStatusColor =
    operationStatus === 'Operação crítica'
      ? DS.red
      : operationStatus === 'Operação em atenção'
        ? DS.yellow
        : DS.green

  const mainBottleneck = hasSlaRisk && worstStageByCount
    ? `SLA acima do limite na etapa ${worstStageByCount}.`
    : hasLossRisk && worstLoss
      ? `Perdas concentradas na etapa ${worstLoss.stage}.`
      : slowestStage
        ? `Maior tempo médio na etapa ${slowestStage.from_stage}.`
        : 'Nenhum gargalo crítico identificado pelos dados atuais.'

  const recommendedAction = hasCriticalSla
    ? 'Priorizar as oportunidades acima do SLA, redistribuir carteira se necessário e cobrar ação imediata dos responsáveis.'
    : hasSlaRisk
      ? 'Atacar primeiro as oportunidades paradas e acompanhar a evolução por etapa ainda hoje.'
      : hasLossRisk
        ? 'Revisar os motivos de perda e ajustar abordagem comercial na etapa mais sensível.'
        : hasConversionRisk
          ? 'Revisar a passagem entre etapas e identificar onde o funil está perdendo eficiência.'
          : 'Manter a cadência operacional e acompanhar preventivamente os indicadores de SLA e avanço.'

  const funnelHealthText = slaCount > 0
    ? `${slaCount} oportunidades estão acima do SLA. A prioridade é destravar o funil antes de ampliar volume.`
    : 'Nenhuma oportunidade acima do SLA no momento. A operação não apresenta risco operacional crítico pelos dados atuais.'

  const funnelStages = [
    { key: 'novo', label: 'Novo' },
    { key: 'contato', label: 'Contato' },
    { key: 'respondeu', label: 'Respondeu' },
    { key: 'negociacao', label: 'Negociação' },
    { key: 'ganho', label: 'Ganho' },
    { key: 'perdido', label: 'Perdido' },
  ]

  const funnelStatusCounts = cycleStatusRows.reduce<Record<string, number>>((acc, row) => {
    const status = row.status || 'sem_status'
    acc[status] = (acc[status] ?? 0) + 1
    return acc
  }, {})

  const openFunnelCount = cycleStatusRows.filter(
    (row) => !['ganho', 'perdido', 'cancelado'].includes(row.status)
  ).length

  const closedFunnelCount = cycleStatusRows.filter(
    (row) => ['ganho', 'perdido'].includes(row.status)
  ).length

  const stageWithMostAccumulation = funnelStages
    .filter((stage) => !['ganho', 'perdido'].includes(stage.key))
    .map((stage) => ({
      ...stage,
      count: funnelStatusCounts[stage.key] ?? 0,
    }))
    .sort((a, b) => b.count - a.count)[0]

  const funnelAccumulationText =
    stageWithMostAccumulation && stageWithMostAccumulation.count > 0
      ? `A maior concentração atual está em ${stageWithMostAccumulation.label}, com ${stageWithMostAccumulation.count} oportunidades.`
      : 'Não há acúmulo relevante nas etapas abertas do funil.'

  const conversionLeak = convRows
    .filter((row) => row.entered > 0)
    .slice()
    .sort((a, b) => a.conversion - b.conversion)[0]

  const conversionLeakText = conversionLeak
    ? `Maior vazamento identificado em ${conversionLeak.from_stage} → ${conversionLeak.to_stage}, com ${conversionLeak.conversion.toFixed(0)}% de conversão.`
    : 'Ainda não há volume suficiente para apontar um vazamento de conversão confiável.'

  const lossText = worstLoss
    ? `Maior perda em ${worstLoss.stage}, com ${worstLoss.loss_rate.toFixed(0)}% de perda registrada.`
    : 'Ainda não há perda suficiente para formar diagnóstico confiável.'

  const timeBottleneckText = slowestStage
    ? `Etapa mais lenta: ${slowestStage.from_stage}, com tempo médio de ${formatSeconds(slowestStage.avg_seconds)} e mediana de ${formatSeconds(slowestStage.median_seconds)}.`
    : 'Ainda não há dados suficientes para identificar gargalo de tempo.'

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        padding: '0 0 60px 0',
        color: DS.textPrimary,
        background: DS.contentBg,
      }}
    >
      <div
        style={{
          background: `linear-gradient(135deg, ${DS.blue}18 0%, ${DS.contentBg} 60%)`,
          borderBottom: `1px solid ${DS.border}`,
          padding: '32px 40px 24px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 800,
            color: DS.textPrimary,
            letterSpacing: '-0.02em',
          }}
        >
          Auditoria do Funil
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: DS.textSecondary,
            maxWidth: 680,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Diagnóstico da saúde operacional do funil: SLA, acúmulo por etapa, vazamentos, perdas e gargalos de execução.
        </p>

        <div style={{ marginTop: 8 }}>
          <ReportNavDropdown currentPath="/relatorios/gerais" />
        </div>
      </div>

      <div style={{ maxWidth: 980, margin: '28px auto 0', padding: '0 24px', display: 'grid', gap: 20 }}>
        {/* ============================================================== */}
        {/* DIAGNÓSTICO DA OPERAÇÃO                                         */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${operationStatusColor}35`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: `linear-gradient(135deg, ${operationStatusColor}10 0%, ${DS.cardBg} 38%, ${DS.cardBg} 100%)`,
            boxShadow: DS.shadowCard,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 18,
                  fontWeight: 900,
                  color: DS.textPrimary,
                  letterSpacing: '-0.02em',
                }}
              >
                Diagnóstico da operação
              </h2>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 12,
                  color: DS.textSecondary,
                  lineHeight: 1.5,
                  maxWidth: 640,
                }}
              >
                Esta leitura mostra onde o funil está travando, qual risco exige ação e qual decisão gerencial deve ser tomada primeiro.
              </p>
            </div>

            <div
              style={{
                padding: '7px 13px',
                borderRadius: 999,
                background: `${operationStatusColor}18`,
                border: `1px solid ${operationStatusColor}45`,
                color: operationStatusColor,
                fontSize: 12,
                fontWeight: 900,
                whiteSpace: 'nowrap',
              }}
            >
              {operationStatus}
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: 12,
              marginTop: 18,
            }}
          >
            <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Principal gargalo
              </div>
              <div style={{ fontSize: 14, color: DS.textPrimary, fontWeight: 800, lineHeight: 1.35 }}>
                {mainBottleneck}
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                SLA e risco
              </div>
              <div style={{ fontSize: 22, color: slaCount > 0 ? DS.yellow : DS.green, fontWeight: 900 }}>
                {slaCount}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: DS.textSecondary }}>
                oportunidades acima do SLA
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Etapa crítica
              </div>
              <div style={{ fontSize: 18, color: DS.textPrimary, fontWeight: 900, textTransform: 'capitalize' }}>
                {worstStageByCount ?? '—'}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: DS.textSecondary }}>
                maior concentração de risco operacional
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Maior atraso
              </div>
              <div style={{ fontSize: 18, color: mostDelayedLead ? DS.yellow : DS.textPrimary, fontWeight: 900 }}>
                {mostDelayedLead ? formatSeconds(mostDelayedLead.over_seconds) : '—'}
              </div>
              <div style={{ marginTop: 4, fontSize: 11, color: DS.textSecondary }}>
                {mostDelayedLead ? mostDelayedLead.name : 'sem atraso crítico'}
              </div>
            </div>
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: DS.radius,
              border: `1px solid ${operationStatusColor}25`,
              background: `${operationStatusColor}08`,
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.6 }}>
              <b style={{ color: operationStatusColor }}>Leitura:</b> {funnelHealthText}
            </div>

            <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.6 }}>
              <b style={{ color: DS.textPrimary }}>Ação recomendada:</b> {recommendedAction}
            </div>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link
              href="/leads?risk=1"
              style={{
                color: DS.textPrimary,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 12px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.panelBg,
              }}
            >
              Ver oportunidades em risco →
            </Link>

            <Link
              href="/dashboard/simulador-meta"
              style={{
                color: DS.blueSoft,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 700,
                padding: '8px 12px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.panelBg,
              }}
            >
              Planejamento de meta no Simulador →
            </Link>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SAÚDE DO FUNIL                                                  */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 900, color: DS.textPrimary }}>
                Saúde do funil
              </h3>
              <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5, maxWidth: 680 }}>
                Mostra a distribuição atual das oportunidades e aponta se existe acúmulo operacional em alguma etapa.
              </div>
            </div>

            <div
              style={{
                padding: '6px 11px',
                borderRadius: 999,
                background: `${operationStatusColor}12`,
                border: `1px solid ${operationStatusColor}35`,
                color: operationStatusColor,
                fontSize: 11,
                fontWeight: 900,
              }}
            >
              {openFunnelCount} abertas · {closedFunnelCount} fechadas
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 10,
              marginTop: 16,
            }}
          >
            {funnelStages.map((stage) => {
              const count = funnelStatusCounts[stage.key] ?? 0
              const isCriticalStage =
                stageWithMostAccumulation?.key === stage.key &&
                count > 0 &&
                !['ganho', 'perdido'].includes(stage.key)
              const isClosedPositive = stage.key === 'ganho'
              const isClosedNegative = stage.key === 'perdido'

              return (
                <div
                  key={stage.key}
                  style={{
                    padding: 13,
                    borderRadius: DS.radius,
                    background: DS.panelBg,
                    border: `1px solid ${
                      isCriticalStage
                        ? `${DS.yellow}55`
                        : isClosedPositive
                          ? `${DS.green}35`
                          : isClosedNegative
                            ? `${DS.red}35`
                            : DS.border
                    }`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      color: DS.textLabel,
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                      marginBottom: 8,
                    }}
                  >
                    {stage.label}
                  </div>
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 900,
                      color: isClosedPositive ? DS.green : isClosedNegative ? DS.red : DS.textPrimary,
                      lineHeight: 1,
                    }}
                  >
                    {count}
                  </div>
                  <div style={{ marginTop: 6, fontSize: 11, color: DS.textSecondary }}>
                    {isCriticalStage ? 'maior acúmulo atual' : 'oportunidades'}
                  </div>
                </div>
              )
            })}
          </div>

          <div
            style={{
              marginTop: 14,
              padding: 14,
              borderRadius: DS.radius,
              border: `1px solid ${DS.border}`,
              background: DS.panelBg,
              fontSize: 12,
              color: DS.textSecondary,
              lineHeight: 1.6,
            }}
          >
            <b style={{ color: DS.textPrimary }}>Leitura:</b> {funnelAccumulationText}
          </div>
        </div>

        {/* ============================================================== */}
        {/* SLA, CONVERSÃO, PERDAS E GARGALOS                               */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: 15, fontWeight: 900, color: DS.textPrimary }}>
              Pontos críticos da operação
            </h3>
            <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.5, maxWidth: 720 }}>
              Resumo dos principais sinais que explicam onde o funil está perdendo velocidade, eficiência ou previsibilidade.
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: 12,
              marginTop: 16,
            }}
          >
            <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${slaCount > 0 ? `${DS.yellow}40` : DS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                SLA e risco
              </div>
              <div style={{ fontSize: 22, color: slaCount > 0 ? DS.yellow : DS.green, fontWeight: 900 }}>
                {slaCount}
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: DS.textSecondary, lineHeight: 1.5 }}>
                {slaCount > 0 ? `Etapa mais crítica: ${worstStageByCount ?? 'não identificada'}.` : 'Sem oportunidades acima do SLA.'}
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Conversão e vazamento
              </div>
              <div style={{ fontSize: 13, color: DS.textPrimary, fontWeight: 800, lineHeight: 1.5 }}>
                {conversionLeakText}
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${worstLoss ? `${DS.red}35` : DS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Perdas
              </div>
              <div style={{ fontSize: 13, color: DS.textPrimary, fontWeight: 800, lineHeight: 1.5 }}>
                {lossText}
              </div>
            </div>

            <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${slowestStage ? `${DS.blue}35` : DS.border}` }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                Gargalo de tempo
              </div>
              <div style={{ fontSize: 13, color: DS.textPrimary, fontWeight: 800, lineHeight: 1.5 }}>
                {timeBottleneckText}
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* REFERÊNCIA DE META — contexto secundário do Simulador            */}
        {/* ============================================================== */}
        {metaVal > 0 ? (
          <div
            style={{
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer,
              padding: 20,
              background: DS.cardBg,
              boxShadow: DS.shadowCard,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: 13, fontWeight: 800, color: DS.blueSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Referência de meta
                </h3>
                <div style={{ fontSize: 12, color: DS.textSecondary }}>
                  Resumo financeiro mantido apenas como contexto. O planejamento completo continua no Simulador de Meta.
                </div>
              </div>

              <div
                style={{
                  padding: '6px 14px',
                  borderRadius: DS.radius,
                  background: `${statusColor}18`,
                  border: `1px solid ${statusColor}40`,
                  color: statusColor,
                  fontSize: 13,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {statusMeta === 'no_ritmo' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : statusMeta === 'atencao' ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                  </svg>
                )}
                {statusLabelText}
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DS.textLabel, marginBottom: 4 }}>
                <span>
                  Faturamento real: <b style={{ color: DS.textPrimary }}>{toBRL(faturReal)}</b>
                </span>
                <span>
                  Meta: <b style={{ color: DS.textPrimary }}>{toBRL(metaVal)}</b>
                </span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: DS.panelBg, overflow: 'hidden', position: 'relative' }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, progressPct)}%`,
                    background: `linear-gradient(90deg, ${DS.blue}, ${statusColor})`,
                    borderRadius: 5,
                    transition: 'width 0.5s ease',
                  }}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: DS.textMuted, marginTop: 3 }}>
                <span>{progressPct.toFixed(1)}% alcançado</span>
                <span>Projeção: {toBRL(projecao)} ({projecaoPct.toFixed(0)}%)</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 20 }}>
              <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Faturamento / dia útil
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Necessário p/ meta</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{toBRL(faturNecessarioDia)}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Realizado (média)</span>
                  <b style={{ fontSize: 13, color: faturDiario >= faturNecessarioDia ? DS.green : DS.red }}>{toBRL(faturDiario)}</b>
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Ritmo de oportunidades
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Restantes no plano</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{ciclosRestantes}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Ritmo restante/dia</span>
                  <b style={{ fontSize: 13, color: ciclosRestantesPorDia > 0 ? DS.yellow : DS.green }}>{ciclosRestantesPorDia}</b>
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Taxa usada no plano
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Planejada/manual</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{(taxaConversao * 100).toFixed(0)}%</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Real observada</span>
                  <b style={{ fontSize: 13, color: workedCount < 30 ? DS.yellow : DS.textPrimary }}>{(taxaReal * 100).toFixed(1)}%</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Amostra</span>
                  <b style={{ fontSize: 13, color: workedCount < 30 ? DS.yellow : DS.textPrimary }}>{workedCount} oportunidades</b>
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Plano de vendas
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Meta derivada</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{vendasNecessarias}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Registradas no funil</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{currentWins}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Restantes pelo gap</span>
                  <b style={{ fontSize: 13, color: vendasRestantes > 0 ? DS.yellow : DS.green }}>{vendasRestantes}</b>
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 14,
                borderRadius: DS.radius,
                background: `${statusColor}08`,
                border: `1px solid ${statusColor}25`,
              }}
            >
              <div style={{ fontSize: 12, color: DS.textSecondary, lineHeight: 1.7 }}>
                <b style={{ color: statusColor }}>Resumo:</b>{' '}
                Faltam <b style={{ color: DS.textPrimary }}>{toBRL(gap)}</b> para a meta em{' '}
                <b style={{ color: DS.textPrimary }}>{diasUteisRest} dias úteis</b>.{' '}
                {diasUteisRest > 0 ? (
                  <>
                    Precisa faturar <b style={{ color: DS.textPrimary }}>{toBRL(faturNecessarioDia)}/dia</b>{' '}
                    e trabalhar <b style={{ color: DS.textPrimary }}>{ciclosRestantesPorDia} oportunidades/dia</b>.{' '}
                  </>
                ) : null}
                {metaVsRealityError ? (
                  <>
                    Atenção: <b style={{ color: DS.yellow }}>{metaVsRealityError}</b>
                  </>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 10, fontSize: 10, color: DS.textMuted }}>
              Dados calculados com o mesmo período e a mesma meta financeira do Simulador. Período usado: {formatDateBR(periodStart)} até {formatDateBR(periodEnd)}. Ticket usado no plano: {toBRL(ticketParaCalc)}.
              {workedCount < 30 ? ' ⚠️ Amostra pequena — dados ganham precisão com mais movimentações.' : ''}
            </div>
          </div>
        ) : (
          <div
            style={{
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer,
              padding: 20,
              background: DS.cardBg,
              boxShadow: DS.shadowCard,
            }}
          >
            <h3 style={{ margin: '0 0 6px 0', fontSize: 13, fontWeight: 800, color: DS.blueSoft, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Referência de meta
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: DS.textMuted }}>
              Nenhuma meta cadastrada para este mês. Configure no{' '}
              <Link href="/dashboard/simulador-meta" style={{ color: DS.blue, textDecoration: 'none' }}>
                Simulador de Meta
              </Link>.
            </p>
          </div>
        )}

        {/* ============================================================== */}
        {/* SLA / RISCO — DETALHAMENTO                                      */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <h3
                style={{
                  margin: '0 0 6px 0',
                  fontSize: 13,
                  fontWeight: 800,
                  color: DS.blueSoft,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Detalhamento: oportunidades em risco
              </h3>

              <div style={{ fontSize: 12, color: DS.textSecondary }}>
                Total em risco: <b style={{ color: DS.textPrimary }}>{slaCount}</b>
                {worstStageByCount ? (
                  <>
                    {' '}
                    | Etapa mais crítica:{' '}
                    <b style={{ textTransform: 'capitalize', color: DS.red }}>{worstStageByCount}</b>
                  </>
                ) : null}
              </div>
            </div>

            <Link
              href="/leads?risk=1"
              style={{
                color: DS.textPrimary,
                textDecoration: 'none',
                fontSize: 12,
                fontWeight: 600,
                padding: '8px 14px',
                borderRadius: DS.radius,
                border: `1px solid ${DS.border}`,
                background: DS.panelBg,
                whiteSpace: 'nowrap',
                transition: 'all 200ms ease',
                opacity: slaCount === 0 ? 0.6 : 1,
              }}
              title={
                slaCount === 0
                  ? 'Abrir o Pipeline filtrado (no momento não há oportunidades acima do SLA)'
                  : 'Abrir o Pipeline mostrando somente as oportunidades acima do SLA'
              }
            >
              Abrir no Pipeline →
            </Link>
          </div>

          {slaErr ? (
            <div
              style={{
                marginTop: 12,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: `4px solid ${DS.red}`,
                borderRadius: DS.radius,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Erro ao buscar SLA/Risco: {slaErr.message}
            </div>
          ) : (
            <>
              <p style={{ color: DS.textSecondary, marginTop: 10, fontSize: 12, lineHeight: 1.5 }}>
                Aqui aparecem oportunidades em etapas ativas cujo tempo na etapa ultrapassou o SLA padrão.
              </p>

              {slaRows.length === 0 ? (
                <div style={{ marginTop: 12, color: DS.textMuted, fontSize: 13 }}>
                  Nenhuma oportunidade acima do SLA no momento.
                </div>
              ) : (
                <div style={{ overflowX: 'auto', marginTop: 14 }}>
                  <table
                    style={{
                      width: '100%',
                      borderCollapse: 'collapse',
                      minWidth: 820,
                    }}
                  >
                    <thead>
                      <tr>
                        <th style={thStyle}>Lead</th>
                        <th style={thStyle}>Consultor</th>
                        <th style={thStyle}>Etapa</th>
                        <th style={thStyle}>Tempo na etapa</th>
                        <th style={thStyle}>SLA</th>
                        <th style={thStyle}>Atraso</th>
                        <th style={thStyle}>Contato</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topRiskLeads.map((r) => (
                        <tr key={r.lead_id}>
                          <td style={tdStyle}>
                            <a
                              href={`/leads?risk=1&lead=${encodeURIComponent(r.lead_id)}`}
                              style={{ color: DS.textPrimary, textDecoration: 'none', fontWeight: 700 }}
                              title="Abrir no Pipeline e destacar este lead"
                            >
                              {r.name}
                            </a>
                          </td>
                          <td style={tdStyle}>
                            {r.owner_name ? r.owner_name : <span style={{ color: DS.textMuted, fontStyle: 'italic' }}>Sem dono</span>}
                          </td>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.stage}</td>
                          <td style={tdStyle}>{formatSeconds(r.seconds_in_stage)}</td>
                          <td style={tdStyle}>{formatSeconds(r.sla_seconds)}</td>
                          <td style={tdBold}>{formatSeconds(r.over_seconds)}</td>
                          <td style={tdStyle}>{r.phone ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {slaRows.length > 50 ? (
                    <div style={{ marginTop: 10, color: DS.textMuted, fontSize: 12 }}>
                      Mostrando top 50 por atraso. Total em risco: {slaRows.length}.
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        </div>

        {/* ============================================================== */}
        {/* CONVERSÃO — DETALHAMENTO                                        */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 800,
                color: DS.blueSoft,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Detalhamento: conversão entre etapas
            </h3>
            <div style={{ fontSize: 12, color: DS.textSecondary }}>
              Conversão final (Negociação → Fechado): <b style={{ color: DS.textPrimary }}>{finalConv.toFixed(2)}%</b>
            </div>
          </div>

          {convErr ? (
            <div
              style={{
                marginTop: 12,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: `4px solid ${DS.red}`,
                borderRadius: DS.radius,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Erro ao buscar conversão: {convErr.message}
            </div>
          ) : (
            <>
              <p style={{ color: DS.textSecondary, marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                Baseado em oportunidades únicas que entraram na etapa e depois progrediram para a próxima.
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>De</th>
                      <th style={thStyle}>Para</th>
                      <th style={thStyle}>Entraram</th>
                      <th style={thStyle}>Progrediram</th>
                      <th style={thStyle}>Conversão</th>
                    </tr>
                  </thead>
                  <tbody>
                    {convRows.length === 0 ? (
                      <tr>
                        <td style={{ ...tdStyle, color: DS.textMuted }} colSpan={5}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      convRows.map((r) => (
                        <tr key={`${r.from_stage}->${r.to_stage}`}>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.from_stage}</td>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.to_stage}</td>
                          <td style={tdStyle}>{r.entered}</td>
                          <td style={tdStyle}>{r.progressed}</td>
                          <td style={tdBold}>{r.conversion.toFixed(2)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ============================================================== */}
        {/* PERDAS — DETALHAMENTO                                           */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 16,
              alignItems: 'center',
              flexWrap: 'wrap',
            }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 13,
                fontWeight: 800,
                color: DS.blueSoft,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Detalhamento: perdas por etapa
            </h3>
            <div style={{ fontSize: 12, color: DS.textSecondary }}>
              Maior perda:{' '}
              <b style={{ color: DS.red }}>
                {worstLoss ? `${worstLoss.stage} (${worstLoss.loss_rate.toFixed(2)}%)` : '—'}
              </b>
            </div>
          </div>

          {lossErr ? (
            <div
              style={{
                marginTop: 12,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: `4px solid ${DS.red}`,
                borderRadius: DS.radius,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Erro ao buscar perdas: {lossErr.message}
            </div>
          ) : (
            <>
              <p style={{ color: DS.textSecondary, marginTop: 8, fontSize: 12, lineHeight: 1.5 }}>
                Percentual de oportunidades que saíram da etapa direto para perdido.
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 820 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Etapa</th>
                      <th style={thStyle}>Entraram</th>
                      <th style={thStyle}>Viraram perdido</th>
                      <th style={thStyle}>Taxa de perda</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lossRows.length === 0 ? (
                      <tr>
                        <td style={{ ...tdStyle, color: DS.textMuted }} colSpan={4}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      lossRows.map((r) => (
                        <tr key={`loss-${r.stage}`}>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.stage}</td>
                          <td style={tdStyle}>{r.entered}</td>
                          <td style={tdStyle}>{r.lost}</td>
                          <td style={tdBold}>{r.loss_rate.toFixed(2)}%</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* ============================================================== */}
        {/* GARGALO — DETALHAMENTO                                          */}
        {/* ============================================================== */}
        <div
          style={{
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            padding: 20,
            background: DS.cardBg,
            boxShadow: DS.shadowCard,
          }}
        >
          <h3
            style={{
              margin: '0 0 6px 0',
              fontSize: 13,
              fontWeight: 800,
              color: DS.blueSoft,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Detalhamento: gargalo por etapa
          </h3>

          {timeErr ? (
            <div
              style={{
                marginTop: 12,
                background: DS.redBg,
                border: `1px solid ${DS.redBorder}`,
                borderLeft: `4px solid ${DS.red}`,
                borderRadius: DS.radius,
                padding: '10px 14px',
                color: '#fca5a5',
                fontSize: 13,
              }}
            >
              Erro ao buscar gargalo: {timeErr.message}
            </div>
          ) : (
            <>
              <p style={{ color: DS.textSecondary, marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>
                Baseado nos eventos de mudança de etapa registrados no funil.
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Etapa de origem</th>
                      <th style={thStyle}>Movimentos</th>
                      <th style={thStyle}>Tempo médio</th>
                      <th style={thStyle}>Mediana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {timeRows.length === 0 ? (
                      <tr>
                        <td style={{ ...tdStyle, color: DS.textMuted }} colSpan={4}>
                          Sem dados ainda.
                        </td>
                      </tr>
                    ) : (
                      timeRows.map((r) => (
                        <tr key={r.from_stage}>
                          <td style={{ ...tdStyle, textTransform: 'capitalize' }}>{r.from_stage}</td>
                          <td style={tdStyle}>{r.moves}</td>
                          <td style={tdStyle}>{formatSeconds(r.avg_seconds)}</td>
                          <td style={tdStyle}>{formatSeconds(r.median_seconds)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}