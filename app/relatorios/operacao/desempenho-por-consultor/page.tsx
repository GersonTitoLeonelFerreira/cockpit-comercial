'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { STAGE_LABELS, resolveCheckpointData } from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'
import {
  CHANNEL_COLORS,
  CHANNEL_LABELS,
  extractChannelFromEvent,
} from '@/app/config/channelNormalization'
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

type ConsultantStat = {
  sellerId: string
  sellerName: string
  activities: number
  advances: number
  won: number
  lost: number
  nextActions: number
  cycles: number
  revenue: number
  advanceRate: number
  winRate: number
  disciplineRate: number
  topChannel: string | null
}

type SortKey =
  | 'sellerName'
  | 'revenue'
  | 'activities'
  | 'cycles'
  | 'advances'
  | 'won'
  | 'lost'
  | 'nextActions'
  | 'advanceRate'
  | 'winRate'
  | 'disciplineRate'

const STAGE_ORDER = ['novo', 'contato', 'respondeu', 'negociacao'] as const

const SUBNAV = [
  { label: 'Visão Executiva', href: '/relatorios/operacao/visao-executiva' },
  { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa' },
  { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
  { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
  { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
  { label: 'Canais', href: '/relatorios/operacao/canais' },
  { label: 'Desempenho por Consultor', href: null },
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
  return shiftDateKey(getBusinessDateKey(), -30)
}

function getTodayDate() {
  return getBusinessDateKey()
}

function safePct(numerator: number, denominator: number) {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
}

function fmtCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function cardStyle(): React.CSSProperties {
  return {
    background: '#141722',
    border: '1px solid #1a1d2e',
    borderRadius: 9,
  }
}

function getStage(metadata: Record<string, unknown>) {
  return (
    String(
      metadata.from_status ??
        metadata.from_stage ??
        metadata.stage ??
        metadata.to_status ??
        '',
    ).toLowerCase() || 'desconhecido'
  )
}

function isActivityEvent(event: RawEvent) {
  const kind = classifyEvent(event)

  if (kind === 'activity') return true

  const metadata = event.metadata ?? {}
  const eventType = event.event_type.toLowerCase()

  return Boolean(
    metadata.action_id ||
      metadata.quick_action ||
      metadata.action_channel ||
      metadata.action_result ||
      metadata.objection ||
      eventType === 'contacted' ||
      eventType === 'replied' ||
      eventType === 'note_added',
  )
}

function filterRevenueRows<T extends { ref_date: string }>(
  rows: T[],
  dateStart: string,
  dateEnd: string,
) {
  return rows.filter((row) => row.ref_date >= dateStart && row.ref_date <= dateEnd)
}

function buildStats(
  events: RawEvent[],
  sellers: SellerOption[],
  revenueBySeller: Map<string, number>,
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string,
  stageFilter: string,
): ConsultantStat[] {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  const nameMap = new Map(
    sellers.map((seller) => [
      seller.id,
      seller.full_name || seller.email || seller.id,
    ]),
  )

  const statsMap = new Map<
    string,
    {
      activities: number
      advances: number
      won: number
      lost: number
      nextActions: number
      cycles: Set<string>
      channels: Record<string, number>
    }
  >()

  function getOrCreate(sellerId: string) {
    const current = statsMap.get(sellerId)

    if (current) return current

    const created = {
      activities: 0,
      advances: 0,
      won: 0,
      lost: 0,
      nextActions: 0,
      cycles: new Set<string>(),
      channels: {} as Record<string, number>,
    }

    statsMap.set(sellerId, created)
    return created
  }

  for (const seller of sellers) {
    getOrCreate(seller.id)
  }

  for (const event of events) {
    if (event.occurred_at < rangeStart || event.occurred_at > rangeEnd) continue

    const sellerId = event.created_by
    if (!sellerId) continue

    if (isAdmin && selectedSellerId && sellerId !== selectedSellerId) continue
    if (!isAdmin && sellerId !== currentUserId) continue

    const metadata = event.metadata ?? {}
    const stage = getStage(metadata)

    if (stageFilter && stage !== stageFilter) continue

    const stat = getOrCreate(sellerId)

    if (event.cycle_id) {
      stat.cycles.add(event.cycle_id)
    }

    const kind = classifyEvent(event)

    if (kind === 'stage_move') {
      stat.advances += 1
      continue
    }

    if (kind === 'won') {
      stat.won += 1
      continue
    }

    if (kind === 'lost') {
      stat.lost += 1
      continue
    }

    const checkpoint = resolveCheckpointData(metadata)
    const nextAction = String(
      metadata.next_action ?? checkpoint.next_action ?? '',
    ).trim()

    if (kind === 'next_action' || nextAction) {
      stat.nextActions += 1
    }

    if (isActivityEvent(event)) {
      stat.activities += 1

      const channel = extractChannelFromEvent(metadata)

      if (channel) {
        stat.channels[channel] = (stat.channels[channel] ?? 0) + 1
      }
    }
  }

  const sellerIds = new Set([
    ...sellers.map((seller) => seller.id),
    ...statsMap.keys(),
    ...revenueBySeller.keys(),
  ])

  return Array.from(sellerIds)
    .map((sellerId) => {
      const raw = getOrCreate(sellerId)
      const totalClosed = raw.won + raw.lost
      const topChannel =
        Object.entries(raw.channels).sort((a, b) => b[1] - a[1])[0]?.[0] ??
        null

      return {
        sellerId,
        sellerName: nameMap.get(sellerId) ?? sellerId.slice(0, 8),
        activities: raw.activities,
        advances: raw.advances,
        won: raw.won,
        lost: raw.lost,
        nextActions: raw.nextActions,
        cycles: raw.cycles.size,
        revenue: revenueBySeller.get(sellerId) ?? 0,
        advanceRate: safePct(raw.advances, raw.activities),
        winRate: safePct(raw.won, totalClosed),
        disciplineRate: safePct(raw.nextActions, raw.cycles.size),
        topChannel,
      }
    })
    .filter((stat) => {
      if (!isAdmin) return stat.sellerId === currentUserId
      if (selectedSellerId) return stat.sellerId === selectedSellerId

      return (
        stat.activities > 0 ||
        stat.advances > 0 ||
        stat.won > 0 ||
        stat.lost > 0 ||
        stat.revenue > 0
      )
    })
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

function MetricTile({
  label,
  value,
  color,
}: {
  label: string
  value: number
  color: string
}) {
  return (
    <div
      style={{
        background: '#0d0f14',
        border: '1px solid #1a1d2e',
        borderRadius: 7,
        minWidth: 0,
        padding: '10px 11px',
      }}
    >
      <div style={{ color: '#546070', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color, fontSize: 18, fontWeight: 900, marginTop: 5 }}>
        {value}
      </div>
    </div>
  )
}

function DisciplineBlock({ value }: { value: number }) {
  const color = value >= 60 ? '#34d399' : value >= 30 ? '#f59e0b' : '#ef4444'

  return (
    <div
      style={{
        background: '#0d0f14',
        border: '1px solid #1a1d2e',
        borderRadius: 8,
        minWidth: 138,
        padding: '11px 12px',
      }}
    >
      <div style={{ color: '#546070', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Disciplina
      </div>
      <div style={{ alignItems: 'baseline', display: 'flex', gap: 5, marginTop: 5 }}>
        <span style={{ color, fontSize: 22, fontWeight: 900 }}>{value}%</span>
        <span style={{ color: '#546070', fontSize: 10 }}>próxima ação</span>
      </div>
      <div style={{ background: '#1a1d2e', borderRadius: 99, height: 5, marginTop: 9, overflow: 'hidden' }}>
        <div style={{ background: color, borderRadius: 99, height: '100%', width: `${value}%` }} />
      </div>
    </div>
  )
}

function ConsultantRow({ stat, index }: { stat: ConsultantStat; index: number }) {
  const channelLabel = stat.topChannel
    ? CHANNEL_LABELS[stat.topChannel] ?? stat.topChannel
    : 'Sem canal'
  const channelColor = stat.topChannel
    ? CHANNEL_COLORS[stat.topChannel] ?? '#8fa3bc'
    : '#546070'

  return (
    <article
      style={{
        background: index % 2 === 0 ? '#111420' : '#0f121c',
        borderBottom: '1px solid #1a1d2e',
        display: 'grid',
        gap: 14,
        gridTemplateColumns: 'minmax(220px, 1.15fr) minmax(150px, 0.65fr) minmax(350px, 1.65fr) minmax(138px, 0.55fr)',
        padding: '17px 18px',
      }}
    >
      <div
        style={{
          alignItems: 'flex-start',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
        }}
      >
        <div style={{ color: '#edf2f7', fontSize: 15, fontWeight: 900 }}>
          {stat.sellerName}
        </div>
        <div style={{ color: '#8fa3bc', fontSize: 11, marginTop: 5 }}>
          {stat.cycles} ciclos · {stat.nextActions} próximas ações
        </div>
        <div
          style={{
            alignItems: 'center',
            color: channelColor,
            display: 'flex',
            fontSize: 11,
            fontWeight: 800,
            gap: 6,
            marginTop: 9,
          }}
        >
          <span style={{ background: channelColor, borderRadius: 99, height: 7, width: 7 }} />
          {channelLabel}
        </div>
      </div>

      <div
        style={{
          alignItems: 'flex-start',
          background: '#0d0f14',
          border: '1px solid #1a1d2e',
          borderRadius: 8,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          minWidth: 0,
          padding: '12px 14px',
        }}
      >
        <div style={{ color: '#546070', fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Faturamento
        </div>
        <div style={{ color: '#fde68a', fontSize: 20, fontWeight: 900, marginTop: 6 }}>
          {fmtCurrency(stat.revenue)}
        </div>
        <div style={{ color: '#8fa3bc', fontSize: 10, marginTop: 5 }}>
          conciliado no período
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 8,
          gridTemplateColumns: 'repeat(5, minmax(62px, 1fr))',
          minWidth: 0,
        }}
      >
        <MetricTile label="Atividades" value={stat.activities} color="#c4b5fd" />
        <MetricTile label="Avanços" value={stat.advances} color="#86efac" />
        <MetricTile label="Ganhos" value={stat.won} color="#86efac" />
        <MetricTile label="Perdas" value={stat.lost} color="#fca5a5" />
        <MetricTile label="Conv." value={stat.winRate} color="#93c5fd" />
      </div>

      <DisciplineBlock value={stat.disciplineRate} />
    </article>
  )
}

export default function DesempenhoPorConsultorPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [loadingData, setLoadingData] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])
  const [stats, setStats] = React.useState<ConsultantStat[]>([])

  const [dateStart, setDateStart] = React.useState(getThirtyDaysAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)
  const [selectedStage, setSelectedStage] = React.useState('')
  const [sortKey, setSortKey] = React.useState<SortKey>('revenue')
  const [sortDirection, setSortDirection] = React.useState<'asc' | 'desc'>('desc')

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

    const resolvedCompanyId: string = companyId
    const resolvedCurrentUserId: string = currentUserId

    async function loadReport() {
      setLoadingData(true)
      setError(null)

      try {
        const params = new URLSearchParams({
          date_start: dateStart,
          date_end: dateEnd,
        })

        const [actionsResponse, revenueRows] = await Promise.all([
          fetch(
            `/api/reports/operations/actions?${params.toString()}`,
            {
              cache: 'no-store',
            },
          ),
          faturamentoService.getRevenueDailySellers(
            supabase,
            resolvedCompanyId,
          ),
        ])

        const payload = (await actionsResponse.json().catch(() => ({}))) as {
          ok?: boolean
          events?: RawEvent[]
          error?: string
        }

        if (!actionsResponse.ok || !payload.ok) {
          throw new Error(
            payload.error ?? 'Erro ao carregar eventos do relatório.',
          )
        }

        const revenueBySeller = new Map<string, number>()

        for (const row of filterRevenueRows(revenueRows, dateStart, dateEnd)) {
          revenueBySeller.set(
            row.seller_id,
            (revenueBySeller.get(row.seller_id) ?? 0) +
              Number(row.real_value ?? 0),
          )
        }

        setStats(
          buildStats(
            payload.events ?? [],
            sellers,
            revenueBySeller,
            dateStart,
            dateEnd,
            selectedSellerId,
            isAdmin,
            resolvedCurrentUserId,
            selectedStage,
          ),
        )
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar dados.')
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
    sellers,
    supabase,
  ])

  const sortedStats = [...stats].sort((first, second) => {
    const a = first[sortKey]
    const b = second[sortKey]
    const direction = sortDirection === 'asc' ? 1 : -1

    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b, 'pt-BR') * direction
    }

    return (Number(a) - Number(b)) * direction
  })

  const totalRevenue = stats.reduce((sum, stat) => sum + stat.revenue, 0)
  const totalActivities = stats.reduce((sum, stat) => sum + stat.activities, 0)
  const totalAdvances = stats.reduce((sum, stat) => sum + stat.advances, 0)
  const topRevenue = [...stats].sort((a, b) => b.revenue - a.revenue)[0] ?? null

  function changeSort(nextKey: SortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextKey)
    setSortDirection(nextKey === 'sellerName' ? 'asc' : 'desc')
  }

  if (loading) {
    return (
      <div style={{ alignItems: 'center', background: '#090b0f', color: '#8fa3bc', display: 'flex', justifyContent: 'center', minHeight: '100vh' }}>
        Carregando Desempenho por Consultor...
      </div>
    )
  }

  if (error && stats.length === 0) {
    return (
      <div style={{ alignItems: 'center', background: '#090b0f', color: '#8fa3bc', display: 'flex', justifyContent: 'center', minHeight: '100vh', padding: 24 }}>
        <div style={{ ...cardStyle(), maxWidth: 480, padding: 24, textAlign: 'center' }}>
          <strong style={{ color: '#fca5a5' }}>Não foi possível carregar o relatório.</strong>
          <div style={{ fontSize: 13, marginTop: 8 }}>{error}</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: '#090b0f', color: '#edf2f7', minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1280 }}>
        <a href="/relatorios" style={{ color: '#8fa3bc', display: 'inline-flex', fontSize: 13, marginBottom: 28, textDecoration: 'none' }}>
          ← Voltar para Relatórios
        </a>

        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Desempenho por Consultor</h1>
          <p style={{ color: '#8fa3bc', fontSize: 13, margin: '7px 0 0' }}>
            Comparativo de execução comercial, conversão e faturamento conciliado por consultor.
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

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={fieldLabelStyle}>Ordenar por</span>
            <select value={sortKey} onChange={(event) => changeSort(event.target.value as SortKey)} style={{ ...inputStyle, minWidth: 170 }}>
              <option value="revenue">Faturamento</option>
              <option value="activities">Atividades</option>
              <option value="advances">Avanços</option>
              <option value="won">Ganhos</option>
              <option value="lost">Perdas</option>
              <option value="disciplineRate">Disciplina</option>
              <option value="winRate">Conversão</option>
              <option value="sellerName">Nome</option>
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
            Panorama da equipe
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <KpiCard label="Consultores ativos" value={stats.length} detail="consultores com operação ou faturamento no período" accent="#60a5fa" />
            <KpiCard label="Faturamento real" value={fmtCurrency(totalRevenue)} detail="mesma base conciliada da Gestão de Faturamento" accent="#fde68a" />
            <KpiCard label="Atividades registradas" value={totalActivities} detail="interações comerciais atribuídas à equipe" accent="#a78bfa" />
            <KpiCard label="Avanços" value={totalAdvances} detail="movimentações posteriores no funil" accent="#86efac" />
            <KpiCard label="Maior faturamento" value={topRevenue?.sellerName ?? '—'} detail={topRevenue ? fmtCurrency(topRevenue.revenue) : 'sem dados no período'} accent="#fde68a" />
          </div>
        </section>

        {sortedStats.length === 0 && !loadingData ? (
          <section style={{ ...cardStyle(), color: '#8fa3bc', padding: '48px 24px', textAlign: 'center' }}>
            <strong style={{ color: '#edf2f7' }}>Nenhum desempenho encontrado no período.</strong>
            <div style={{ fontSize: 12, marginTop: 7 }}>
              Ajuste o período, o consultor ou a etapa selecionada.
            </div>
          </section>
        ) : (
          <section style={{ ...cardStyle(), overflowX: 'auto' }}>
            <div
              style={{
                alignItems: 'center',
                borderBottom: '1px solid #1a1d2e',
                color: '#546070',
                display: 'grid',
                fontSize: 10,
                fontWeight: 800,
                gap: 14,
                gridTemplateColumns: 'minmax(220px, 1.15fr) minmax(150px, 0.65fr) minmax(350px, 1.65fr) minmax(138px, 0.55fr)',
                letterSpacing: '0.06em',
                padding: '12px 18px',
                textTransform: 'uppercase',
              }}
            >
              <button onClick={() => changeSort('sellerName')} style={headerButtonStyle(sortKey === 'sellerName')}>
                Consultor {sortKey === 'sellerName' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </button>
              <button onClick={() => changeSort('revenue')} style={headerButtonStyle(sortKey === 'revenue', 'right')}>
                Faturamento {sortKey === 'revenue' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </button>
              <div>Execução comercial</div>
              <button onClick={() => changeSort('disciplineRate')} style={headerButtonStyle(sortKey === 'disciplineRate', 'right')}>
                Disciplina {sortKey === 'disciplineRate' ? (sortDirection === 'asc' ? '↑' : '↓') : ''}
              </button>
            </div>

            {sortedStats.map((stat, index) => (
              <ConsultantRow key={stat.sellerId} stat={stat} index={index} />
            ))}
          </section>
        )}
      </div>
    </div>
  )
}

function headerButtonStyle(active: boolean, textAlign: React.CSSProperties['textAlign'] = 'left'): React.CSSProperties {
  return {
    background: 'transparent',
    border: 0,
    color: active ? '#93c5fd' : '#546070',
    cursor: 'pointer',
    fontSize: 10,
    fontWeight: 800,
    letterSpacing: '0.06em',
    padding: 0,
    textAlign,
    textTransform: 'uppercase',
  }
}
