'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { STAGE_LABELS, resolveCheckpointData } from '@/app/config/stageActions'
import * as faturamentoService from '@/app/lib/services/faturamento'

type SellerOption = {
  id: string
  full_name: string | null
  email: string | null
  role: string
}

type RawEvent = {
  id: string
  cycle_id: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  occurred_at: string
  created_by: string | null
}

type NextActionStat = {
  label: string
  total: number
  byStage: Record<string, number>
  withDate: number
  withoutDate: number
}

type ReportData = {
  actions: NextActionStat[]
  totalEvents: number
  totalWithDate: number
  totalWithoutDate: number
}

const STAGE_ORDER = ['novo', 'contato', 'respondeu', 'negociacao'] as const

const STAGE_COLORS: Record<string, string> = {
  novo: '#60a5fa',
  contato: '#a78bfa',
  respondeu: '#34d399',
  negociacao: '#fbbf24',
}

const SUBNAV = [
  { label: 'Visão Executiva', href: '/relatorios/operacao/visao-executiva' },
  { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa' },
  { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
  { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
  { label: 'Próximas Ações', href: null },
  { label: 'Canais', href: '/relatorios/operacao/canais' },
  { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor' },
]

const fieldLabelStyle: React.CSSProperties = {
  color: '#4a5569',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

const inputStyle: React.CSSProperties = {
  background: '#0d0f14',
  border: '1px solid #1a1d2e',
  borderRadius: 7,
  color: '#edf2f7',
  colorScheme: 'dark',
  fontSize: 13,
  outline: 'none',
  padding: '7px 10px',
}

function getThirtyDaysAgo() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString().slice(0, 10)
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

function safePct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function cardStyle(): React.CSSProperties {
  return {
    background: '#141722',
    border: '1px solid #1a1d2e',
    borderRadius: 9,
  }
}

function buildReportData(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string,
  stageFilter: string,
): ReportData {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`
  const actionMap = new Map<string, NextActionStat>()

  for (const event of events) {
    if (event.occurred_at < rangeStart || event.occurred_at > rangeEnd) continue
    if (isAdmin && selectedSellerId && event.created_by !== selectedSellerId) continue
    if (!isAdmin && event.created_by !== currentUserId) continue

    const metadata = event.metadata ?? {}
    const checkpoint = resolveCheckpointData(metadata)

    const rawAction = String(
      metadata.next_action ?? checkpoint.next_action ?? '',
    ).trim()

    if (!rawAction) continue

    const rawDate = String(
      metadata.next_action_date ??
        metadata.next_contact_at ??
        checkpoint.next_action_date ??
        checkpoint.next_contact_at ??
        '',
    ).trim()

    const stage =
      String(
        metadata.to_status ??
          metadata.from_status ??
          metadata.from_stage ??
          metadata.stage ??
          '',
      ).toLowerCase() || 'desconhecida'

    if (stageFilter && stage !== stageFilter) continue

    const key = rawAction.toLocaleLowerCase('pt-BR')
    const current = actionMap.get(key) ?? {
      label: rawAction,
      total: 0,
      byStage: {},
      withDate: 0,
      withoutDate: 0,
    }

    current.total += 1
    current.byStage[stage] = (current.byStage[stage] ?? 0) + 1

    if (rawDate) current.withDate += 1
    else current.withoutDate += 1

    actionMap.set(key, current)
  }

  const actions = Array.from(actionMap.values()).sort((a, b) => b.total - a.total)
  const totalEvents = actions.reduce((sum, action) => sum + action.total, 0)
  const totalWithDate = actions.reduce((sum, action) => sum + action.withDate, 0)
  const totalWithoutDate = actions.reduce((sum, action) => sum + action.withoutDate, 0)

  return { actions, totalEvents, totalWithDate, totalWithoutDate }
}

function KpiCard({
  label,
  value,
  detail,
  accent = '#edf2f7',
}: {
  label: string
  value: React.ReactNode
  detail: string
  accent?: string
}) {
  return (
    <div style={{ ...cardStyle(), minWidth: 0, padding: 18 }}>
      <div style={fieldLabelStyle}>{label}</div>
      <div
        style={{
          color: accent,
          fontSize: 25,
          fontWeight: 900,
          lineHeight: 1.1,
          marginTop: 10,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </div>
      <div style={{ color: '#8fa3bc', fontSize: 11, lineHeight: 1.45, marginTop: 8 }}>
        {detail}
      </div>
    </div>
  )
}

function StageBadges({ byStage }: { byStage: Record<string, number> }) {
  const stages = STAGE_ORDER.filter((stage) => (byStage[stage] ?? 0) > 0)

  if (stages.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {stages.map((stage) => (
        <span
          key={stage}
          style={{
            background: `${STAGE_COLORS[stage]}16`,
            border: `1px solid ${STAGE_COLORS[stage]}33`,
            borderRadius: 4,
            color: STAGE_COLORS[stage],
            fontSize: 10,
            fontWeight: 800,
            padding: '3px 6px',
          }}
        >
          {STAGE_LABELS[stage] ?? stage}: {byStage[stage]}
        </span>
      ))}
    </div>
  )
}

function ActionRow({
  action,
  maxTotal,
}: {
  action: NextActionStat
  maxTotal: number
}) {
  const plannedRate = safePct(action.withDate, action.total)
  const barWidth = maxTotal > 0 ? (action.total / maxTotal) * 100 : 0

  return (
    <div style={{ borderBottom: '1px solid #13162a', padding: '14px 0' }}>
      <div style={{ alignItems: 'flex-start', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr) 64px 92px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ color: '#edf2f7', fontSize: 13, lineHeight: 1.45 }}>
            {action.label}
          </div>
          <StageBadges byStage={action.byStage} />
        </div>

        <div style={{ color: '#edf2f7', fontSize: 14, fontWeight: 900, textAlign: 'right' }}>
          {action.total}
          <div style={{ color: '#546070', fontSize: 10, fontWeight: 700, marginTop: 3, textTransform: 'uppercase' }}>
            registros
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ color: plannedRate >= 70 ? '#86efac' : plannedRate >= 40 ? '#fde68a' : '#fca5a5', fontSize: 14, fontWeight: 900 }}>
            {plannedRate}%
          </div>
          <div style={{ color: '#546070', fontSize: 10, fontWeight: 700, marginTop: 3, textTransform: 'uppercase' }}>
            com data
          </div>
        </div>
      </div>

      <div style={{ background: '#1a1d2e', borderRadius: 99, height: 5, marginTop: 11, overflow: 'hidden' }}>
        <div style={{ background: '#f59e0b', borderRadius: 99, height: '100%', width: `${barWidth}%` }} />
      </div>
    </div>
  )
}

export default function ProximasAcoesPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [loadingData, setLoadingData] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])
  const [data, setData] = React.useState<ReportData | null>(null)

  const [dateStart, setDateStart] = React.useState(getThirtyDaysAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)
  const [selectedStage, setSelectedStage] = React.useState('')

  React.useEffect(() => {
    async function initialize() {
      setLoading(true)
      setError(null)

      try {
        const response = await fetch('/api/me', { cache: 'no-store' })

        if (!response.ok) {
          throw new Error('Não foi possível identificar a empresa ativa.')
        }

        const me = (await response.json()) as {
          user_id?: string
          active_company_id?: string | null
          active_role?: string | null
          active_company_role?: string | null
          is_platform_admin?: boolean
        }

        if (!me.user_id) throw new Error('Sessão expirada. Faça login novamente.')
        if (!me.active_company_id) throw new Error('Nenhuma empresa ativa foi encontrada.')

        const activeSellers = await faturamentoService.getSellers(
          supabase,
          me.active_company_id,
        )

        const role = String(
          me.active_role ?? me.active_company_role ?? '',
        ).toLowerCase()

        const adminUser =
          me.is_platform_admin === true ||
          ['admin', 'owner', 'manager'].includes(role)

        setCurrentUserId(me.user_id)
        setCompanyId(me.active_company_id)
        setIsAdmin(adminUser)
        setSellers(activeSellers as SellerOption[])
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar a página.')
      } finally {
        setLoading(false)
      }
    }

    void initialize()
  }, [supabase])

  React.useEffect(() => {
    if (companyId === null || currentUserId === null) return

    const resolvedCurrentUserId: string = currentUserId

async function loadReport() {
  setLoadingData(true)
  setError(null)

  try {
    const params = new URLSearchParams({
      date_start: dateStart,
      date_end: dateEnd,
    })

    const response = await fetch(
      `/api/reports/operations/actions?${params.toString()}`,
      {
        cache: 'no-store',
      },
    )

    const payload = (await response.json().catch(() => ({}))) as {
      ok?: boolean
      events?: RawEvent[]
      error?: string
    }

    if (!response.ok || !payload.ok) {
      throw new Error(
        payload.error ?? 'Erro ao carregar dados do relatório.',
      )
    }

    setData(
      buildReportData(
        payload.events ?? [],
        dateStart,
        dateEnd,
        selectedSellerId,
        isAdmin,
        resolvedCurrentUserId,
        selectedStage,
      ),
    )
  } catch (cause: unknown) {
    setError(
      cause instanceof Error
        ? cause.message
        : 'Erro ao carregar dados.',
    )
  } finally {
    setLoadingData(false)
  }
}

    void loadReport()
  }, [
    companyId,
    currentUserId,
    dateStart,
    dateEnd,
    selectedSellerId,
    selectedStage,
    isAdmin,
  ])

  if (loading) {
    return (
      <div style={{ alignItems: 'center', background: '#090b0f', color: '#8fa3bc', display: 'flex', justifyContent: 'center', minHeight: '100vh' }}>
        Carregando Próximas Ações...
      </div>
    )
  }

  if (error && data === null) {
    return (
      <div style={{ alignItems: 'center', background: '#090b0f', color: '#8fa3bc', display: 'flex', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
        <div style={{ ...cardStyle(), maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <strong style={{ color: '#fca5a5' }}>Não foi possível carregar o relatório.</strong>
          <div style={{ fontSize: 13, marginTop: 8 }}>{error}</div>
        </div>
      </div>
    )
  }

  const actions = data?.actions ?? []
  const maxTotal = actions[0]?.total ?? 1
  const topAction = actions[0] ?? null
  const plannedRate = safePct(data?.totalWithDate ?? 0, data?.totalEvents ?? 0)

  return (
    <div style={{ background: '#090b0f', color: '#edf2f7', minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1200 }}>
        <a href="/relatorios" style={{ color: '#8fa3bc', display: 'inline-flex', fontSize: 13, marginBottom: 28, textDecoration: 'none' }}>
          ← Voltar para Relatórios
        </a>

        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Próximas Ações</h1>
          <p style={{ color: '#8fa3bc', fontSize: 13, margin: '7px 0 0' }}>
            Leitura das próximas ações registradas e do nível de compromisso com uma data definida.
          </p>
        </header>

        <nav style={{ borderBottom: '1px solid #1a1d2e', display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 26 }}>
          {SUBNAV.map((tab) =>
            tab.href === null ? (
              <span key={tab.label} style={{ borderBottom: '2px solid #fde68a', color: '#fde68a', fontSize: 13, fontWeight: 800, marginBottom: -1, padding: '9px 14px' }}>
                {tab.label}
              </span>
            ) : (
              <a key={tab.label} href={tab.href} style={{ borderBottom: '2px solid transparent', color: '#8fa3bc', fontSize: 13, marginBottom: -1, padding: '9px 14px', textDecoration: 'none' }}>
                {tab.label}
              </a>
            ),
          )}
        </nav>

        <section style={{ ...cardStyle(), alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 24, padding: '16px 20px' }}>
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>De</span>
            <input type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} style={inputStyle} />
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>Até</span>
            <input type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} style={inputStyle} />
          </label>

          {isAdmin && (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={fieldLabelStyle}>Consultor</span>
              <select value={selectedSellerId ?? ''} onChange={(event) => setSelectedSellerId(event.target.value || null)} style={{ ...inputStyle, minWidth: 215 }}>
                <option value="">Todos os consultores</option>
                {sellers.map((seller) => (
                  <option key={seller.id} value={seller.id}>
                    {seller.full_name || seller.email || seller.id}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>Etapa</span>
            <select value={selectedStage} onChange={(event) => setSelectedStage(event.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
              <option value="">Todas as etapas</option>
              {STAGE_ORDER.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage] ?? stage}
                </option>
              ))}
            </select>
          </label>

          {loadingData && <span style={{ color: '#8fa3bc', fontSize: 12, paddingBottom: 8 }}>Atualizando...</span>}
        </section>

        {error && (
          <div style={{ background: '#ef444414', border: '1px solid #ef444440', borderRadius: 7, color: '#fca5a5', fontSize: 13, marginBottom: 20, padding: '10px 14px' }}>
            {error}
          </div>
        )}

        <section style={{ marginBottom: 28 }}>
          <div style={{ color: '#fde68a', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 12, textTransform: 'uppercase' }}>
            Organização da agenda
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <KpiCard label="Próximas ações" value={data?.totalEvents ?? 0} detail="registros de ação futura identificados" accent="#fde68a" />
            <KpiCard label="Com data definida" value={data?.totalWithDate ?? 0} detail={`${plannedRate}% das ações têm compromisso de data`} accent="#86efac" />
            <KpiCard label="Sem data definida" value={data?.totalWithoutDate ?? 0} detail="ações que não permitem acompanhar cobrança e atraso" accent="#fca5a5" />
            <KpiCard label="Ação mais planejada" value={topAction?.label ?? '—'} detail={topAction ? `${topAction.total} registro(s) no período` : 'sem dados no período'} accent="#fde68a" />
          </div>
        </section>

        {actions.length === 0 && !loadingData ? (
          <section style={{ ...cardStyle(), color: '#8fa3bc', padding: '48px 24px', textAlign: 'center' }}>
            <strong style={{ color: '#edf2f7' }}>Nenhuma próxima ação registrada no período.</strong>
            <div style={{ fontSize: 12, marginTop: 7 }}>
              Ajuste o período, o consultor ou a etapa selecionada.
            </div>
          </section>
        ) : (
          <section style={{ ...cardStyle(), padding: '18px 20px' }}>
            <div style={{ borderBottom: '1px solid #13162a', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr) 64px 92px', paddingBottom: 12 }}>
              <span style={{ color: '#546070', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Próxima ação</span>
              <span style={{ color: '#546070', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textAlign: 'right', textTransform: 'uppercase' }}>Volume</span>
              <span style={{ color: '#546070', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textAlign: 'right', textTransform: 'uppercase' }}>Com data</span>
            </div>
            {actions.map((action) => (
              <ActionRow key={action.label.toLowerCase()} action={action} maxTotal={maxTotal} />
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
