'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import {
  STAGE_ACTIONS,
  STAGE_LABELS,
  extractActionFromEvent,
} from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'
import * as faturamentoService from '@/app/lib/services/faturamento'
import { getBusinessDateKey, shiftDateKey } from '@/app/lib/services/executionDayMath'

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

type ActionStats = {
  actionId: string
  label: string
  stage: string
  category: 'activity' | 'outcome'
  total: number
  advanced: number
  won: number
  lost: number
  advancePct: number
  wonPct: number
  lostPct: number
}

type SortKey = 'total' | 'advancePct' | 'wonPct' | 'lostPct'

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
  { label: 'Avanço por Ação', href: null },
  { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
  { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
  { label: 'Canais', href: '/relatorios/operacao/canais' },
  { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor' },
]

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

const fieldLabelStyle: React.CSSProperties = {
  color: '#4a5569',
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: '0.07em',
  textTransform: 'uppercase',
}

function getThirtyDaysAgo() {
  return shiftDateKey(getBusinessDateKey(), -30)
}

function getTodayDate() {
  return getBusinessDateKey()
}

function addDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T12:00:00`)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function safePct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function formatPercent(value: number) {
  return `${value}%`
}

function cardStyle(): React.CSSProperties {
  return {
    background: '#141722',
    border: '1px solid #1a1d2e',
    borderRadius: 9,
  }
}

function buildActionStats(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string,
): ActionStats[] {
  const cycleEvents = new Map<string, RawEvent[]>()

  for (const event of events) {
    if (!event.cycle_id) continue

    const list = cycleEvents.get(event.cycle_id) ?? []
    list.push(event)
    cycleEvents.set(event.cycle_id, list)
  }

  for (const list of cycleEvents.values()) {
    list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  }

  const statsMap = new Map<
    string,
    { total: number; advanced: number; won: number; lost: number }
  >()

  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  for (const event of events) {
    if (event.occurred_at < rangeStart || event.occurred_at > rangeEnd) continue

    if (isAdmin && selectedSellerId && event.created_by !== selectedSellerId) continue
    if (!isAdmin && event.created_by !== currentUserId) continue

    const actionId = extractActionFromEvent(event)
    if (!actionId || !event.cycle_id) continue

    const list = cycleEvents.get(event.cycle_id) ?? []
    const eventIndex = list.findIndex((item) => item.id === event.id)
    const subsequentEvents = eventIndex >= 0 ? list.slice(eventIndex + 1) : []

    let advanced = false
    let won = false
    let lost = false

    for (const subsequent of subsequentEvents) {
      const kind = classifyEvent(subsequent)

      if (kind === 'stage_move') advanced = true
      if (kind === 'won') won = true
      if (kind === 'lost') lost = true
    }

    const stats = statsMap.get(actionId) ?? {
      total: 0,
      advanced: 0,
      won: 0,
      lost: 0,
    }

    stats.total += 1
    if (advanced) stats.advanced += 1
    if (won) stats.won += 1
    if (lost) stats.lost += 1

    statsMap.set(actionId, stats)
  }

  const result: ActionStats[] = []

  for (const stage of STAGE_ORDER) {
    for (const action of STAGE_ACTIONS[stage]) {
      const stats = statsMap.get(action.id) ?? {
        total: 0,
        advanced: 0,
        won: 0,
        lost: 0,
      }

      result.push({
        actionId: action.id,
        label: action.label,
        stage: action.stage,
        category: action.category,
        total: stats.total,
        advanced: stats.advanced,
        won: stats.won,
        lost: stats.lost,
        advancePct: safePct(stats.advanced, stats.total),
        wonPct: safePct(stats.won, stats.total),
        lostPct: safePct(stats.lost, stats.total),
      })
    }
  }

  return result
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
          fontSize: 24,
          fontWeight: 900,
          lineHeight: 1.15,
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

function MetricBar({
  value,
  color,
}: {
  value: number
  color: string
}) {
  return (
    <div
      style={{
        background: '#1a1d2e',
        borderRadius: 99,
        height: 5,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          background: color,
          borderRadius: 99,
          height: '100%',
          width: `${Math.max(0, Math.min(value, 100))}%`,
        }}
      />
    </div>
  )
}

function StageSection({
  stage,
  stats,
  sortKey,
}: {
  stage: string
  stats: ActionStats[]
  sortKey: SortKey
}) {
  const stageStats = stats
    .filter((stat) => stat.stage === stage)
    .filter((stat) => stat.total > 0)
    .sort((a, b) => b[sortKey] - a[sortKey])

  const stageTotal = stageStats.reduce((sum, stat) => sum + stat.total, 0)
  const stageColor = STAGE_COLORS[stage] ?? '#8fa3bc'

  return (
    <section style={{ ...cardStyle(), padding: '18px 20px' }}>
      <div
        style={{
          alignItems: 'center',
          borderBottom: '1px solid #13162a',
          display: 'flex',
          justifyContent: 'space-between',
          paddingBottom: 14,
        }}
      >
        <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
          <span style={{ background: stageColor, borderRadius: 99, height: 9, width: 9 }} />
          <span style={{ color: stageColor, fontSize: 14, fontWeight: 900 }}>
            {STAGE_LABELS[stage] ?? stage}
          </span>
        </div>
        <span style={{ color: '#edf2f7', fontSize: 14, fontWeight: 800 }}>
          {stageTotal}
          <span style={{ color: '#546070', fontSize: 11, fontWeight: 500 }}> ações</span>
        </span>
      </div>

      {stageStats.length === 0 ? (
        <div style={{ color: '#546070', fontSize: 12, paddingTop: 18 }}>
          Nenhuma ação com resultado mensurável nesta etapa no período.
        </div>
      ) : (
        <>
          <div
            style={{
              color: '#546070',
              display: 'grid',
              fontSize: 10,
              fontWeight: 800,
              gap: 12,
              gridTemplateColumns: 'minmax(0, 1fr) 68px 68px 68px 68px',
              letterSpacing: '0.06em',
              padding: '12px 0 6px',
              textTransform: 'uppercase',
            }}
          >
            <span>Ação</span>
            <span style={{ textAlign: 'right' }}>Volume</span>
            <span style={{ textAlign: 'right' }}>Avanço</span>
            <span style={{ textAlign: 'right' }}>Ganho</span>
            <span style={{ textAlign: 'right' }}>Perda</span>
          </div>

          {stageStats.map((stat) => (
            <div
              key={stat.actionId}
              style={{
                alignItems: 'center',
                borderTop: '1px solid #13162a',
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'minmax(0, 1fr) 68px 68px 68px 68px',
                padding: '12px 0',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ alignItems: 'center', display: 'flex', gap: 8 }}>
                  <span
                    style={{
                      background: stat.category === 'outcome' ? '#a78bfa14' : '#60a5fa14',
                      border: `1px solid ${
                        stat.category === 'outcome' ? '#a78bfa33' : '#60a5fa33'
                      }`,
                      borderRadius: 4,
                      color: stat.category === 'outcome' ? '#a78bfa' : '#60a5fa',
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      padding: '3px 6px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {stat.category === 'outcome' ? 'resultado' : 'atividade'}
                  </span>
                  <span
                    style={{
                      color: '#edf2f7',
                      fontSize: 13,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {stat.label}
                  </span>
                </div>
              </div>

              <span style={{ color: '#edf2f7', fontSize: 13, fontWeight: 800, textAlign: 'right' }}>
                {stat.total}
              </span>

              <div style={{ display: 'grid', gap: 5 }}>
                <span style={{ color: '#93c5fd', fontSize: 12, fontWeight: 800, textAlign: 'right' }}>
                  {formatPercent(stat.advancePct)}
                </span>
                <MetricBar value={stat.advancePct} color="#60a5fa" />
              </div>

              <div style={{ display: 'grid', gap: 5 }}>
                <span style={{ color: '#86efac', fontSize: 12, fontWeight: 800, textAlign: 'right' }}>
                  {formatPercent(stat.wonPct)}
                </span>
                <MetricBar value={stat.wonPct} color="#34d399" />
              </div>

              <div style={{ display: 'grid', gap: 5 }}>
                <span style={{ color: '#fca5a5', fontSize: 12, fontWeight: 800, textAlign: 'right' }}>
                  {formatPercent(stat.lostPct)}
                </span>
                <MetricBar value={stat.lostPct} color="#ef4444" />
              </div>
            </div>
          ))}
        </>
      )}
    </section>
  )
}

export default function AvancoPorAcaoPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [loadingData, setLoadingData] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])
  const [actionStats, setActionStats] = React.useState<ActionStats[]>([])

  const [dateStart, setDateStart] = React.useState(getThirtyDaysAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)
  const [sortKey, setSortKey] = React.useState<SortKey>('total')

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

        const activeSellers = await faturamentoService.getSellers(supabase, me.active_company_id)
        const role = String(me.active_role ?? me.active_company_role ?? '').toLowerCase()
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

async function loadData() {
  setLoadingData(true)
  setError(null)

  try {
    const params = new URLSearchParams({
      date_start: dateStart,
      date_end: addDays(dateEnd, 45),
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

    const stats = buildActionStats(
      payload.events ?? [],
      dateStart,
      dateEnd,
      selectedSellerId,
      isAdmin,
      resolvedCurrentUserId,
    )

    setActionStats(stats)
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

    void loadData()
  }, [companyId, currentUserId, dateStart, dateEnd, selectedSellerId, isAdmin])

  const activeStats = actionStats.filter((stat) => stat.total > 0)
  const totalActions = activeStats.reduce((sum, stat) => sum + stat.total, 0)

  const mostUsed =
    activeStats.length > 0
      ? [...activeStats].sort((a, b) => b.total - a.total)[0]
      : null

  const topAdvance =
    activeStats.length > 0
      ? [...activeStats].sort((a, b) => b.advancePct - a.advancePct)[0]
      : null

  const topWon =
    activeStats.length > 0
      ? [...activeStats].sort((a, b) => b.wonPct - a.wonPct)[0]
      : null

  const visibleStages = STAGE_ORDER.filter((stage) =>
    actionStats.some((stat) => stat.stage === stage && stat.total > 0),
  )

  if (loading) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: '#090b0f',
          color: '#8fa3bc',
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        Carregando Avanço por Ação...
      </div>
    )
  }

  if (error && actionStats.length === 0) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: '#090b0f',
          color: '#8fa3bc',
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
        }}
      >
        <div style={{ ...cardStyle(), maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <strong style={{ color: '#fca5a5' }}>Não foi possível carregar o relatório.</strong>
          <div style={{ fontSize: 13, marginTop: 8 }}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#090b0f', color: '#edf2f7', minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1200 }}>
        <a href="/relatorios" style={{ color: '#8fa3bc', display: 'inline-flex', fontSize: 13, marginBottom: 28, textDecoration: 'none' }}>
          ← Voltar para Relatórios
        </a>

        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Avanço por Ação</h1>
          <p style={{ color: '#8fa3bc', fontSize: 13, margin: '7px 0 0' }}>
            Quais ações efetivamente levam o ciclo a avançar, ganhar ou perder.
          </p>
        </header>

        <nav style={{ borderBottom: '1px solid #1a1d2e', display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 26 }}>
          {SUBNAV.map((tab) =>
            tab.href === null ? (
              <span key={tab.label} style={{ borderBottom: '2px solid #60a5fa', color: '#60a5fa', fontSize: 13, fontWeight: 800, marginBottom: -1, padding: '9px 14px' }}>
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
              <select
                value={selectedSellerId ?? ''}
                onChange={(event) => setSelectedSellerId(event.target.value || null)}
                style={{ ...inputStyle, minWidth: 215 }}
              >
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
            <span style={fieldLabelStyle}>Ordenar por</span>
            <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} style={{ ...inputStyle, minWidth: 170 }}>
              <option value="total">Volume</option>
              <option value="advancePct">Taxa de avanço</option>
              <option value="wonPct">Taxa de ganho</option>
              <option value="lostPct">Taxa de perda</option>
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
          <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 12, textTransform: 'uppercase' }}>
            Resultado das ações
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <KpiCard label="Ações avaliadas" value={totalActions} detail="ações com resultado posterior analisável" accent="#60a5fa" />
            <KpiCard
              label="Maior avanço"
              value={topAdvance?.total ? topAdvance.label : '—'}
              detail={topAdvance?.total ? `${formatPercent(topAdvance.advancePct)} de avanço em ${topAdvance.total} ação(ões)` : 'sem dados no período'}
              accent="#93c5fd"
            />
            <KpiCard
              label="Maior ganho"
              value={topWon?.total ? topWon.label : '—'}
              detail={topWon?.total ? `${formatPercent(topWon.wonPct)} de ganho em ${topWon.total} ação(ões)` : 'sem dados no período'}
              accent="#86efac"
            />
            <KpiCard
              label="Ação mais usada"
              value={mostUsed?.total ? mostUsed.label : '—'}
              detail={mostUsed?.total ? `${mostUsed.total} registro(s) no período` : 'sem dados no período'}
              accent="#a78bfa"
            />
          </div>
        </section>

        {totalActions === 0 && !loadingData ? (
          <section style={{ ...cardStyle(), color: '#8fa3bc', padding: '48px 24px', textAlign: 'center' }}>
            <strong style={{ color: '#edf2f7' }}>Nenhuma ação com resultado identificada no período.</strong>
            <div style={{ fontSize: 12, marginTop: 7 }}>
              Ajuste o período ou o consultor selecionado.
            </div>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: 16 }}>
            {visibleStages.map((stage) => (
              <StageSection key={stage} stage={stage} stats={actionStats} sortKey={sortKey} />
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
