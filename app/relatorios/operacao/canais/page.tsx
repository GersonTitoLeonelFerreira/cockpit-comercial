'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { STAGE_LABELS } from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'
import {
  CANONICAL_CHANNELS,
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

type ChannelStat = {
  channel: string
  total: number
  advances: number
  advancePct: number
  byStage: Record<string, number>
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
  { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
  { label: 'Canais', href: null },
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

function buildChannelStats(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string,
  stageFilter: string,
): ChannelStat[] {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`
  const totals = new Map<string, number>()
  const advances = new Map<string, number>()
  const stages = new Map<string, Record<string, number>>()
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

  for (const event of events) {
    if (event.occurred_at < rangeStart || event.occurred_at > rangeEnd) continue
    if (isAdmin && selectedSellerId && event.created_by !== selectedSellerId) continue
    if (!isAdmin && event.created_by !== currentUserId) continue

    const metadata = event.metadata ?? {}
    const stage = getStage(metadata)
    if (stageFilter && stage !== stageFilter) continue

    const channel = extractChannelFromEvent(metadata)
    if (!channel) continue

    totals.set(channel, (totals.get(channel) ?? 0) + 1)

    const byStage = stages.get(channel) ?? {}
    byStage[stage] = (byStage[stage] ?? 0) + 1
    stages.set(channel, byStage)

    const list = event.cycle_id ? cycleEvents.get(event.cycle_id) ?? [] : []
    const index = list.findIndex((item) => item.id === event.id)
    const subsequent = index >= 0 ? list.slice(index + 1) : []

    if (subsequent.some((item) => classifyEvent(item) === 'stage_move')) {
      advances.set(channel, (advances.get(channel) ?? 0) + 1)
    }
  }

  const channels = new Set([...CANONICAL_CHANNELS, ...totals.keys()])

  return Array.from(channels)
    .map((channel) => {
      const total = totals.get(channel) ?? 0
      const channelAdvances = advances.get(channel) ?? 0

      return {
        channel,
        total,
        advances: channelAdvances,
        advancePct: safePct(channelAdvances, total),
        byStage: stages.get(channel) ?? {},
      }
    })
    .sort((a, b) => b.total - a.total)
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
  const entries = STAGE_ORDER.filter((stage) => (byStage[stage] ?? 0) > 0)

  if (entries.length === 0) return null

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
      {entries.map((stage) => (
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

function ChannelRow({
  stat,
  maxTotal,
}: {
  stat: ChannelStat
  maxTotal: number
}) {
  const color = CHANNEL_COLORS[stat.channel] ?? '#94a3b8'
  const label = CHANNEL_LABELS[stat.channel] ?? stat.channel
  const width = maxTotal > 0 ? (stat.total / maxTotal) * 100 : 0

  return (
    <div style={{ borderBottom: '1px solid #13162a', padding: '14px 0' }}>
      <div
        style={{
          alignItems: 'flex-start',
          display: 'grid',
          gap: 14,
          gridTemplateColumns: 'minmax(0, 1fr) 64px 80px 80px',
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 9 }}>
            <span style={{ background: color, borderRadius: 99, height: 9, width: 9 }} />
            <span style={{ color: '#edf2f7', fontSize: 13 }}>{label}</span>
          </div>
          <StageBadges byStage={stat.byStage} />
        </div>

        <div style={{ color: '#edf2f7', fontSize: 14, fontWeight: 900, textAlign: 'right' }}>
          {stat.total}
          <div style={{ color: '#546070', fontSize: 10, fontWeight: 700, marginTop: 3, textTransform: 'uppercase' }}>
            ações
          </div>
        </div>

        <div style={{ color: '#86efac', fontSize: 14, fontWeight: 900, textAlign: 'right' }}>
          {stat.advances}
          <div style={{ color: '#546070', fontSize: 10, fontWeight: 700, marginTop: 3, textTransform: 'uppercase' }}>
            avanços
          </div>
        </div>

        <div style={{ color: stat.advancePct >= 50 ? '#86efac' : stat.advancePct >= 25 ? '#fde68a' : '#fca5a5', fontSize: 14, fontWeight: 900, textAlign: 'right' }}>
          {stat.advancePct}%
          <div style={{ color: '#546070', fontSize: 10, fontWeight: 700, marginTop: 3, textTransform: 'uppercase' }}>
            taxa
          </div>
        </div>
      </div>

      <div style={{ background: '#1a1d2e', borderRadius: 99, height: 5, marginTop: 11, overflow: 'hidden' }}>
        <div style={{ background: color, borderRadius: 99, height: '100%', width: `${width}%` }} />
      </div>
    </div>
  )
}

export default function CanaisPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [loadingData, setLoadingData] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])
  const [stats, setStats] = React.useState<ChannelStat[]>([])

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

    setStats(
      buildChannelStats(
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
        Carregando Canais...
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

  const activeStats = stats.filter((stat) => stat.total > 0)
  const totalActions = activeStats.reduce((sum, stat) => sum + stat.total, 0)
  const totalAdvances = activeStats.reduce((sum, stat) => sum + stat.advances, 0)
  const topChannel = activeStats[0] ?? null
  const bestChannel =
    activeStats.length > 0
      ? [...activeStats].sort((a, b) => b.advancePct - a.advancePct)[0]
      : null
  const maxTotal = topChannel?.total ?? 1

  return (
    <div style={{ background: '#090b0f', color: '#edf2f7', minHeight: '100vh', padding: '32px 24px 80px' }}>
      <div style={{ margin: '0 auto', maxWidth: 1200 }}>
        <a href="/relatorios" style={{ color: '#8fa3bc', display: 'inline-flex', fontSize: 13, marginBottom: 28, textDecoration: 'none' }}>
          ← Voltar para Relatórios
        </a>

        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Canais</h1>
          <p style={{ color: '#8fa3bc', fontSize: 13, margin: '7px 0 0' }}>
            Quais canais geram atividade e ajudam os ciclos a avançar no funil.
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

          {loadingData && <span style={{ color: '#8fa3bc', fontSize: 12, paddingBottom: 8 }}>Atualizando...</span>}
        </section>

        {error && (
          <div style={{ background: '#ef444414', border: '1px solid #ef444440', borderRadius: 7, color: '#fca5a5', fontSize: 13, marginBottom: 20, padding: '10px 14px' }}>
            {error}
          </div>
        )}

        <section style={{ marginBottom: 28 }}>
          <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 12, textTransform: 'uppercase' }}>
            Leitura dos canais
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <KpiCard label="Ações por canal" value={totalActions} detail="ações com canal identificado" accent="#60a5fa" />
            <KpiCard label="Avanços posteriores" value={totalAdvances} detail="ações cujo ciclo avançou depois do contato" accent="#86efac" />
            <KpiCard label="Canal mais usado" value={topChannel ? (CHANNEL_LABELS[topChannel.channel] ?? topChannel.channel) : '—'} detail={topChannel ? `${topChannel.total} ação(ões) registradas` : 'sem dados no período'} accent={topChannel ? CHANNEL_COLORS[topChannel.channel] : '#93c5fd'} />
            <KpiCard label="Maior taxa de avanço" value={bestChannel ? (CHANNEL_LABELS[bestChannel.channel] ?? bestChannel.channel) : '—'} detail={bestChannel ? `${bestChannel.advancePct}% de avanço em ${bestChannel.total} ação(ões)` : 'sem dados no período'} accent="#86efac" />
          </div>
        </section>

        {activeStats.length === 0 && !loadingData ? (
          <section style={{ ...cardStyle(), color: '#8fa3bc', padding: '48px 24px', textAlign: 'center' }}>
            <strong style={{ color: '#edf2f7' }}>Nenhuma ação com canal identificado no período.</strong>
            <div style={{ fontSize: 12, marginTop: 7 }}>
              Ajuste o período, o consultor ou a etapa selecionada.
            </div>
          </section>
        ) : (
          <section style={{ ...cardStyle(), padding: '18px 20px' }}>
            <div style={{ borderBottom: '1px solid #13162a', display: 'grid', gap: 14, gridTemplateColumns: 'minmax(0, 1fr) 64px 80px 80px', paddingBottom: 12 }}>
              <span style={{ color: '#546070', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Canal</span>
              <span style={{ color: '#546070', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textAlign: 'right', textTransform: 'uppercase' }}>Ações</span>
              <span style={{ color: '#546070', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textAlign: 'right', textTransform: 'uppercase' }}>Avanços</span>
              <span style={{ color: '#546070', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', textAlign: 'right', textTransform: 'uppercase' }}>Taxa</span>
            </div>
            {activeStats.map((stat) => (
              <ChannelRow key={stat.channel} stat={stat} maxTotal={maxTotal} />
            ))}
          </section>
        )}
      </div>
    </div>
  )
}
