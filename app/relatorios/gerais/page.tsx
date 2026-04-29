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
  contentBg:     '#090b0f',
  surfaceBg:     '#0d1017',
  panelBg:       '#101420',
  cardBg:        '#141722',
  border:        '#1a1d2e',
  textPrimary:   '#edf2f7',
  textSecondary: '#8fa3bc',
  textLabel:     '#6b7fa3',
  textMuted:     '#4a5568',
  blueSoft:      '#7eb6ff',
  blue:          '#3b82f6',
  red:           '#ef4444',
  redBg:         '#1c0a0a',
  redBorder:     '#450a0a',
  green:         '#22c55e',
  yellow:        '#fbbf24',
  radius:        7,
  radiusContainer: 9,
  shadowCard:    '0 2px 12px rgba(0,0,0,0.25)',
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

function toDateKey(value: string) {
  return String(value ?? '').split('T')[0].split(' ')[0]
}

function parseDateKey(value: string) {
  const key = toDateKey(value)
  if (!key) return null

  const date = new Date(`${key}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
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

  // --- Meta vs Realidade — mesma base do Simulador ---
  const { data: activeCompetencyRaw, error: activeCompetencyErr } = await supabase.rpc(
    'rpc_get_active_competency'
  )

  const activeCompetency = (activeCompetencyRaw ?? {}) as Record<string, unknown>
  const competencyMonth = String(activeCompetency.month ?? '')
  const periodStart = toDateKey(String(activeCompetency.month_start ?? ''))
  const periodEnd = toDateKey(String(activeCompetency.month_end ?? ''))
  const hasActivePeriod = Boolean(periodStart && periodEnd)

  const { data: revenueGoalRaw, error: revenueGoalErr } = hasActivePeriod
    ? await supabase.rpc('rpc_get_revenue_goal', {
        p_company_id: companyId,
        p_owner_id: null,
        p_date_start: periodStart,
        p_date_end: periodEnd,
      })
    : { data: null, error: null }

  const { data: revenueSummaryRaw, error: revenueSummaryErr } = hasActivePeriod
    ? await supabase.rpc('rpc_revenue_summary', {
        p_company_id: companyId,
        p_owner_id: null,
        p_start_date: periodStart,
        p_end_date: periodEnd,
        p_metric: 'faturamento',
      })
    : { data: null, error: null }

  const { data: cycleMetricsRaw, error: cycleMetricsErr } = await supabase.rpc(
    'rpc_get_sales_cycle_metrics_v1',
    {
      p_owner_user_id: null,
      p_month: competencyMonth || null,
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

  // O relatório precisa bater com a leitura padrão Planejada do Simulador.
  // Enquanto a escolha Planejada/Real não for persistida no banco, o relatório usa 20%.
  const taxaConversao = 0.20

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
  const ciclosNecessarios = taxaConversao > 0 ? Math.ceil(vendasNecessarias / taxaConversao) : 0
  const ciclosPorDia = diasUteisTot > 0 ? Math.ceil(ciclosNecessarios / diasUteisTot) : 0

  const vendasRestantes = ticketParaCalc > 0 ? Math.ceil(gap / ticketParaCalc) : 0
  const ciclosRestantes = taxaConversao > 0 ? Math.ceil(vendasRestantes / taxaConversao) : 0
  const ciclosRestantesPorDia = diasUteisRest > 0 ? Math.ceil(ciclosRestantes / diasUteisRest) : 0

  const ciclosTrabDia = diasUteisPass > 0 ? workedCount / diasUteisPass : 0

  const pacingRatio = metaVal > 0 ? projecao / metaVal : 0
  const statusMeta = pacingRatio >= 0.95 ? 'no_ritmo' : pacingRatio >= 0.70 ? 'atencao' : 'acelerar'
  const statusColor = statusMeta === 'no_ritmo' ? DS.green : statusMeta === 'atencao' ? DS.yellow : DS.red
  const statusLabelText = statusMeta === 'no_ritmo' ? 'No ritmo' : statusMeta === 'atencao' ? 'Atenção' : 'Acelerar'

  const metaVsRealityError =
    activeCompetencyErr?.message ||
    revenueGoalErr?.message ||
    revenueSummaryErr?.message ||
    cycleMetricsErr?.message ||
    null

  function toBRL(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
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

  // ============================================================================
  // Render
  // ============================================================================

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
      {/* ================================================================== */}
      {/* Header com degradê azul                                            */}
      {/* ================================================================== */}
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
          Relatórios Gerais
        </h1>
        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: DS.textSecondary,
            maxWidth: 600,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Conversão entre etapas, perdas por estágio, gargalos de tempo e oportunidades em risco de SLA.
        </p>

        {/* Navegação de relatórios — dropdown agrupado */}
        <div style={{ marginTop: 8 }}>
          <ReportNavDropdown currentPath="/relatorios/gerais" />
        </div>
      </div>

      {/* ================================================================== */}
      {/* Conteúdo principal                                                 */}
      {/* ================================================================== */}
      <div style={{ maxWidth: 980, margin: '28px auto 0', padding: '0 24px', display: 'grid', gap: 20 }}>

        {/* ============================================================== */}
        {/* META vs REALIDADE — Simulador vs Trabalho Real                  */}
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
                  Meta vs Realidade
                </h3>
                <div style={{ fontSize: 12, color: DS.textSecondary }}>
                  O Simulador define o plano operacional. Este relatório mostra a execução real registrada.
                </div>
              </div>
              <div style={{
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
              }}>
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

            {/* Barra de progresso */}
            <div style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: DS.textLabel, marginBottom: 4 }}>
                <span>Faturamento real: <b style={{ color: DS.textPrimary }}>{toBRL(faturReal)}</b></span>
                <span>Meta: <b style={{ color: DS.textPrimary }}>{toBRL(metaVal)}</b></span>
              </div>
              <div style={{ height: 10, borderRadius: 5, background: DS.panelBg, overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(100, progressPct)}%`,
                  background: `linear-gradient(90deg, ${DS.blue}, ${statusColor})`,
                  borderRadius: 5,
                  transition: 'width 0.5s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: DS.textMuted, marginTop: 3 }}>
                <span>{progressPct.toFixed(1)}% alcançado</span>
                <span>Projeção: {toBRL(projecao)} ({projecaoPct.toFixed(0)}%)</span>
              </div>
            </div>

            {/* Grid de comparação: Plano vs Real */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 20 }}>
              {/* Card: Faturamento/dia */}
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

              {/* Card: Ciclos/dia */}
              <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Oportunidades trabalhadas / dia
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Necessário no plano</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{ciclosPorDia}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Realizado (média)</span>
                  <b style={{ fontSize: 13, color: ciclosTrabDia >= ciclosPorDia ? DS.green : DS.red }}>{ciclosTrabDia.toFixed(1)}</b>
                </div>
              </div>

              {/* Card: Taxa de conversão */}
              <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Taxa de conversão
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Usada no relatório</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{(taxaConversao * 100).toFixed(0)}%</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Real (vendas/oportunidades)</span>
                  <b style={{ fontSize: 13, color: taxaReal >= taxaConversao ? DS.green : DS.yellow }}>{(taxaReal * 100).toFixed(1)}%</b>
                </div>
              </div>

              {/* Card: Vendas */}
              <div style={{ padding: 14, borderRadius: DS.radius, background: DS.panelBg, border: `1px solid ${DS.border}` }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: DS.textLabel, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Vendas
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Necessárias no mês</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{vendasNecessarias}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Realizadas</span>
                  <b style={{ fontSize: 13, color: DS.textPrimary }}>{currentWins}</b>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 11, color: DS.textSecondary }}>Faltam</span>
                  <b style={{ fontSize: 13, color: vendasRestantes > 0 ? DS.yellow : DS.green }}>{vendasRestantes}</b>
                </div>
              </div>
            </div>

            {/* Resumo de urgência */}
            <div style={{
              marginTop: 16,
              padding: 14,
              borderRadius: DS.radius,
              background: `${statusColor}08`,
              border: `1px solid ${statusColor}25`,
            }}>
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
            Dados calculados com a mesma base de meta e faturamento do Simulador. Ticket usado no plano: {toBRL(ticketParaCalc)}.
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
              Meta vs Realidade
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: DS.textMuted }}>
              Nenhuma meta cadastrada para este mês. Configure no{' '}
              <Link href="/dashboard/simulador-meta" style={{ color: DS.blue, textDecoration: 'none' }}>Simulador de Meta</Link>.
            </p>
          </div>
        )}

        {/* ============================================================== */}
        {/* SLA / Risco                                                     */}
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
                Oportunidades em risco (acima do SLA)
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
                Aqui aparecem oportunidades em etapas ativas (exceto <b>fechado</b> e <b>perdido</b>)
                cujo tempo na etapa ultrapassou o SLA padrão.
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
        {/* Conversão                                                       */}
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
              Taxa de conversão entre etapas
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
                Baseado em leads únicos que <b>entraram</b> na etapa e depois <b>progrediram</b> para a próxima.
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
        {/* Perdas                                                          */}
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
              Perdas por etapa
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
                % de leads que saíram da etapa direto para <b>perdido</b>.
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
        {/* Gargalo                                                         */}
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
            Gargalo por etapa
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
                Baseado em eventos <code style={{ background: DS.panelBg, padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>stage_changed</code> (lead_events).
              </p>

              <div style={{ overflowX: 'auto', marginTop: 14 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Etapa (from)</th>
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