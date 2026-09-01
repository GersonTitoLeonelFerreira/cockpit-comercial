'use client'

import React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { STAGE_LABELS } from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'
import { extractActionFromEvent } from '@/app/config/stageActions'
import {
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

type StageStat = {
  stage: string
  label: string
  activities: number
  advances: number
  advanceRate: number
}

type ActionStat = {
  actionId: string
  label: string
  cycles: number
  advancedCycles: number
  advanceRate: number
}

type ChannelStat = {
  channel: string
  label: string
  activities: number
  won: number
  lost: number
  winRate: number
  lossRate: number
}

type SellerStat = {
  sellerId: string
  sellerName: string
  activities: number
  cycles: number
  advances: number
  nextActions: number
  won: number
  lost: number
  revenue: number
  disciplineRate: number
}

type ExecutiveData = {
  cyclesWithCommercialActivity: number
  commercialActivities: number
  advances: number
  won: number
  lost: number
  nextActions: number
  overdueNextActions: number
  revenue: number
  revenueSource: 'conciliado'
  advanceRate: number
  winRate: number
  disciplineRate: number
  stageStats: StageStat[]
  actionStats: ActionStat[]
  channelStats: ChannelStat[]
  sellerStats: SellerStat[]
  mainBottleneck: StageStat | null
  topAction: ActionStat | null
  topChannel: ChannelStat | null
  mainRiskSeller: SellerStat | null
  topSeller: SellerStat | null
}

const DS = {
  contentBg: '#090b0f',
  panelBg: '#0d0f14',
  cardBg: '#141722',
  surfaceBg: '#111318',
  border: '#1a1d2e',
  borderSubtle: '#13162a',
  textPrimary: '#edf2f7',
  textSecondary: '#8fa3bc',
  textMuted: '#546070',
  textLabel: '#4a5569',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  blueLight: '#60a5fa',
  green: '#22c55e',
  greenSoft: '#86efac',
  yellow: '#f59e0b',
  yellowSoft: '#fef3c7',
  red: '#ef4444',
  redSoft: '#fca5a5',
  pink: '#f472b6',
  purple: '#a78bfa',
  orange: '#fb923c',
  radius: 7,
  radiusContainer: 9,
  shadowCard: '0 1px 4px rgba(0,0,0,0.4)',
} as const

const STAGES = ['novo', 'contato', 'respondeu', 'negociacao'] as const

const SYSTEM_EVENT_TYPES = new Set([
  'cycle_created',
  'lead_created',
  'assigned',
  'reassigned',
  'owner_assigned',
  'owner_reassigned',
  'returned_to_pool',
  'group_attached',
  'group_changed',
  'group_assigned',
  'group_detached',
  'lead_reactivated_from_import',
  'lead_reactivated_from_manual_create',
  'lead_reactivated_by_admin',
  'ai_analysis_generated',
  'ai_suggestion_applied',
  'ai_suggestion_rejected',
])

function toDateKey(value: string) {
  return value.slice(0, 10)
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

function fmtPct(value: number) {
  return `${value}%`
}

function fmtCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

function getStage(meta: Record<string, unknown>) {
  return String(
    meta.from_status ??
      meta.from_stage ??
      meta.stage ??
      meta.to_status ??
      meta.to_stage ??
      '',
  ).toLowerCase()
}

function getDueDate(meta: Record<string, unknown>) {
  return String(
    meta.due_date ??
      meta.scheduled_at ??
      meta.next_action_date ??
      '',
  ).trim()
}

function isCommercialEvent(event: RawEvent) {
  const eventType = event.event_type.toLowerCase().trim()
  const metadata = event.metadata ?? {}
  const kind = classifyEvent(event)

  if (SYSTEM_EVENT_TYPES.has(eventType)) return false
  if (kind === 'stage_move' || kind === 'next_action' || kind === 'won' || kind === 'lost') return true
  if (eventType.startsWith('quick_')) return true
  if (/^(novo|contato|respondeu|negociacao)_/.test(eventType)) return true

  return Boolean(
    metadata.action_id ||
      metadata.quick_action ||
      metadata.action_channel ||
      metadata.action_result ||
      metadata.next_action ||
      metadata.objection ||
      eventType === 'contacted' ||
      eventType === 'replied' ||
      eventType === 'note_added',
  )
}

function filterRevenueByPeriod<T extends { ref_date: string }>(
  rows: T[],
  dateStart: string,
  dateEnd: string,
) {
  return rows.filter((row) => row.ref_date >= dateStart && row.ref_date <= dateEnd)
}

function buildExecutiveData(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string | null,
  selectedStage: string,
  sellers: SellerOption[],
  revenueBySeller: Map<string, number>,
  extraRevenue: number,
  today: string,
): ExecutiveData {
  const cycleSet = new Set<string>()
  const cycleActions = new Map<string, Set<string>>()
  const cycleHasAdvance = new Set<string>()
  const latestNextActionByCycle = new Map<
    string,
    { sellerId: string; dueDate: string; occurredAt: string }
  >()

  const stageActivities = new Map<string, number>()
  const stageAdvances = new Map<string, number>()
  const channelActivities = new Map<string, number>()
  const channelWon = new Map<string, number>()
  const channelLost = new Map<string, number>()
  const sellerActivities = new Map<string, number>()
  const sellerCycles = new Map<string, Set<string>>()
  const sellerAdvances = new Map<string, number>()
  const sellerWon = new Map<string, number>()
  const sellerLost = new Map<string, number>()

  let commercialActivities = 0
  let advances = 0
  let won = 0
  let lost = 0

  for (const event of events) {
    const eventDate = toDateKey(event.occurred_at)

    if (eventDate < dateStart || eventDate > dateEnd) continue
    if (isAdmin && selectedSellerId && event.created_by !== selectedSellerId) continue
    if (!isAdmin && currentUserId && event.created_by !== currentUserId) continue
    if (!isCommercialEvent(event)) continue

    const meta = event.metadata ?? {}
    const stage = getStage(meta)

    if (selectedStage && stage && stage !== selectedStage) continue

    const sellerId = event.created_by ?? ''
    const kind = classifyEvent(event)
    const channel = extractChannelFromEvent(meta) ?? 'Outro'

    if (event.cycle_id) {
      cycleSet.add(event.cycle_id)

      if (sellerId) {
        if (!sellerCycles.has(sellerId)) sellerCycles.set(sellerId, new Set())
        sellerCycles.get(sellerId)!.add(event.cycle_id)
      }
    }

    const dueDate = getDueDate(meta)

    if (kind === 'next_action' || dueDate) {
      const key = event.cycle_id ?? event.id
      const previous = latestNextActionByCycle.get(key)

      if (!previous || event.occurred_at > previous.occurredAt) {
        latestNextActionByCycle.set(key, {
          sellerId,
          dueDate,
          occurredAt: event.occurred_at,
        })
      }
    }

    if (kind === 'won') {
      won++
      channelWon.set(channel, (channelWon.get(channel) ?? 0) + 1)

      if (sellerId) {
        sellerWon.set(sellerId, (sellerWon.get(sellerId) ?? 0) + 1)
      }

      continue
    }

    if (kind === 'lost') {
      lost++
      channelLost.set(channel, (channelLost.get(channel) ?? 0) + 1)

      if (sellerId) {
        sellerLost.set(sellerId, (sellerLost.get(sellerId) ?? 0) + 1)
      }

      continue
    }

    if (kind === 'stage_move') {
      advances++

      const fromStage = String(meta.from_status ?? meta.from_stage ?? '').toLowerCase()
      const trackStage = fromStage || stage || 'novo'

      stageAdvances.set(trackStage, (stageAdvances.get(trackStage) ?? 0) + 1)
      cycleHasAdvance.add(event.cycle_id ?? event.id)

      if (sellerId) {
        sellerAdvances.set(sellerId, (sellerAdvances.get(sellerId) ?? 0) + 1)
      }

      continue
    }

    if (kind === 'next_action') continue

    commercialActivities++

    const trackStage = stage || 'novo'
    stageActivities.set(trackStage, (stageActivities.get(trackStage) ?? 0) + 1)
    channelActivities.set(channel, (channelActivities.get(channel) ?? 0) + 1)

    if (sellerId) {
      sellerActivities.set(sellerId, (sellerActivities.get(sellerId) ?? 0) + 1)
    }

    if (event.cycle_id) {
      const actionId = extractActionFromEvent(event)

      if (actionId) {
        if (!cycleActions.has(event.cycle_id)) cycleActions.set(event.cycle_id, new Set())
        cycleActions.get(event.cycle_id)!.add(actionId)
      }
    }
  }

  const nextActionsBySeller = new Map<string, number>()
  let nextActions = 0
  let overdueNextActions = 0

  for (const action of latestNextActionByCycle.values()) {
    nextActions++

    if (action.sellerId) {
      nextActionsBySeller.set(
        action.sellerId,
        (nextActionsBySeller.get(action.sellerId) ?? 0) + 1,
      )
    }

    if (action.dueDate && action.dueDate.slice(0, 10) < today) {
      overdueNextActions++
    }
  }

  const stageStats = STAGES.map((stage) => {
    const activities = stageActivities.get(stage) ?? 0
    const stageAdvancesCount = stageAdvances.get(stage) ?? 0

    return {
      stage,
      label: STAGE_LABELS[stage] ?? stage,
      activities,
      advances: stageAdvancesCount,
      advanceRate: safePct(stageAdvancesCount, activities + stageAdvancesCount),
    }
  }).filter((stat) => stat.activities > 0 || stat.advances > 0)

  const mainBottleneck =
    stageStats
      .filter((stat) => stat.activities + stat.advances >= 3)
      .sort((a, b) => a.advanceRate - b.advanceRate)[0] ?? null

  const actionStats = Array.from(cycleActions.entries())
    .flatMap(([cycleId, actionIds]) =>
      Array.from(actionIds).map((actionId) => ({ cycleId, actionId })),
    )
    .reduce<Map<string, { cycles: Set<string>; advancedCycles: Set<string> }>>(
      (map, item) => {
        const value = map.get(item.actionId) ?? {
          cycles: new Set<string>(),
          advancedCycles: new Set<string>(),
        }

        value.cycles.add(item.cycleId)

        if (cycleHasAdvance.has(item.cycleId)) {
          value.advancedCycles.add(item.cycleId)
        }

        map.set(item.actionId, value)
        return map
      },
      new Map(),
    )

  const actionRows = Array.from(actionStats.entries())
    .map(([actionId, value]) => ({
      actionId,
      label: actionId.replace(/_/g, ' '),
      cycles: value.cycles.size,
      advancedCycles: value.advancedCycles.size,
      advanceRate: safePct(value.advancedCycles.size, value.cycles.size),
    }))
    .filter((row) => row.cycles >= 3)
    .sort((a, b) => b.advanceRate - a.advanceRate)

  const allChannels = new Set([
    ...channelActivities.keys(),
    ...channelWon.keys(),
    ...channelLost.keys(),
  ])

  const channelStats = Array.from(allChannels)
    .map((channel) => {
      const activities = channelActivities.get(channel) ?? 0
      const channelWonCount = channelWon.get(channel) ?? 0
      const channelLostCount = channelLost.get(channel) ?? 0
      const closed = channelWonCount + channelLostCount

      return {
        channel,
        label: CHANNEL_LABELS[channel] ?? channel,
        activities,
        won: channelWonCount,
        lost: channelLostCount,
        winRate: safePct(channelWonCount, closed),
        lossRate: safePct(channelLostCount, closed),
      }
    })
    .sort((a, b) => b.activities + b.won + b.lost - (a.activities + a.won + a.lost))

  const sellerNames = new Map(
    sellers.map((seller) => [seller.id, seller.full_name || seller.email || seller.id]),
  )

  const sellerIds = new Set([
    ...sellerActivities.keys(),
    ...sellerCycles.keys(),
    ...sellerAdvances.keys(),
    ...nextActionsBySeller.keys(),
    ...sellerWon.keys(),
    ...sellerLost.keys(),
    ...revenueBySeller.keys(),
  ])

  const sellerStats = Array.from(sellerIds)
    .map((sellerId) => {
      const cycles = sellerCycles.get(sellerId)?.size ?? 0
      const sellerNextActions = nextActionsBySeller.get(sellerId) ?? 0

      return {
        sellerId,
        sellerName: sellerNames.get(sellerId) ?? sellerId.slice(0, 8),
        activities: sellerActivities.get(sellerId) ?? 0,
        cycles,
        advances: sellerAdvances.get(sellerId) ?? 0,
        nextActions: sellerNextActions,
        won: sellerWon.get(sellerId) ?? 0,
        lost: sellerLost.get(sellerId) ?? 0,
        revenue: revenueBySeller.get(sellerId) ?? 0,
        disciplineRate: safePct(sellerNextActions, cycles),
      }
    })
    .sort((a, b) => b.activities + b.advances - (a.activities + a.advances))

  const riskCandidates = sellerStats
    .filter((seller) => seller.cycles >= 3)
    .sort((a, b) => a.disciplineRate - b.disciplineRate)

  const topSellerCandidates = sellerStats
    .filter((seller) => seller.revenue > 0 || seller.won > 0)
    .sort((a, b) => b.revenue - a.revenue || b.won - a.won)

  const revenue = Array.from(revenueBySeller.values()).reduce((sum, value) => sum + value, 0) + extraRevenue

  return {
    cyclesWithCommercialActivity: cycleSet.size,
    commercialActivities,
    advances,
    won,
    lost,
    nextActions,
    overdueNextActions,
    revenue,
    revenueSource: 'conciliado',
    advanceRate: safePct(advances, commercialActivities + advances),
    winRate: safePct(won, won + lost),
    disciplineRate: safePct(nextActions, cycleSet.size),
    stageStats,
    actionStats: actionRows,
    channelStats,
    sellerStats,
    mainBottleneck,
    topAction: actionRows[0] ?? null,
    topChannel:
      channelStats
        .filter((channel) => channel.won + channel.lost >= 2)
        .sort((a, b) => b.winRate - a.winRate)[0] ?? null,
    mainRiskSeller: riskCandidates[0] ?? null,
    topSeller: topSellerCandidates[0] ?? null,
  }
}

function KpiCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string
  value: React.ReactNode
  detail: string
  accent: string
}) {
  return (
    <div
      style={{
        minWidth: 0,
        padding: 18,
        background: DS.panelBg,
        border: `1px solid ${DS.border}`,
        borderRadius: DS.radiusContainer,
        boxShadow: DS.shadowCard,
      }}
    >
      <div
        style={{
          color: DS.textLabel,
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: '0.07em',
          marginBottom: 10,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ color: accent, fontSize: 28, fontWeight: 900, lineHeight: 1, marginBottom: 8 }}>
        {value}
      </div>
      <div style={{ color: DS.textSecondary, fontSize: 11, lineHeight: 1.4 }}>
        {detail}
      </div>
    </div>
  )
}

function InsightCard({
  title,
  body,
  accent,
}: {
  title: string
  body: string
  accent: string
}) {
  return (
    <div
      style={{
        background: DS.cardBg,
        border: `1px solid ${DS.border}`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: DS.radiusContainer,
        padding: '16px 18px',
      }}
    >
      <div style={{ color: DS.textPrimary, fontSize: 13, fontWeight: 800, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.55 }}>
        {body}
      </div>
    </div>
  )
}

function MetricRow({
  label,
  value,
  description,
  accent,
  isLast,
}: {
  label: string
  value: string
  description: string
  accent: string
  isLast?: boolean
}) {
  return (
    <div
      style={{
        alignItems: 'center',
        borderBottom: isLast ? 'none' : `1px solid ${DS.borderSubtle}`,
        display: 'grid',
        gap: 14,
        gridTemplateColumns: '180px 96px 1fr',
        padding: '14px 0',
      }}
    >
      <div style={{ color: DS.textSecondary, fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ color: accent, fontSize: 18, fontWeight: 900 }}>{value}</div>
      <div style={{ color: DS.textSecondary, fontSize: 12, lineHeight: 1.5 }}>{description}</div>
    </div>
  )
}

const SUBNAV = [
  { label: 'Visão Executiva', href: null },
  { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa' },
  { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
  { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
  { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
  { label: 'Canais', href: '/relatorios/operacao/canais' },
  { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor' },
]

export default function VisaoExecutivaPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])
  const [data, setData] = React.useState<ExecutiveData | null>(null)

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

        if (!me.user_id) {
          throw new Error('Sessão expirada. Faça login novamente.')
        }

        if (!me.active_company_id) {
          throw new Error('Nenhuma empresa ativa foi encontrada.')
        }

        const activeSellers = await faturamentoService.getSellers(
          supabase,
          me.active_company_id,
        )

        const membershipRole = String(
          me.active_role ?? me.active_company_role ?? ''
        ).toLowerCase()

        const adminUser =
          me.is_platform_admin === true ||
          ['admin', 'owner', 'manager'].includes(membershipRole)

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
      setRefreshing(true)
      setError(null)

      try {
        const revenueSellerId = isAdmin
          ? selectedSellerId ?? undefined
          : resolvedCurrentUserId

          const params = new URLSearchParams({
            date_start: dateStart,
            date_end: dateEnd,
          })

          if (isAdmin && selectedSellerId) {
            params.set('seller_id', selectedSellerId)
          }

          const [actionsResponse, sellerRevenueRows, extraRevenueRows] =
            await Promise.all([
              fetch(
                `/api/reports/operations/actions?${params.toString()}`,
                {
                  cache: 'no-store',
                },
              ),
              faturamentoService.getRevenueDailySellers(
                supabase,
                resolvedCompanyId,
                revenueSellerId,
              ),
              isAdmin && !selectedSellerId
                ? faturamentoService.getRevenueDailyExtras(
                    supabase,
                    resolvedCompanyId,
                  )
                : Promise.resolve([]),
            ])

          const payload = (await actionsResponse.json().catch(() => ({}))) as {
            ok?: boolean
            events?: RawEvent[]
            error?: string
          }

          if (!actionsResponse.ok || !payload.ok) {
            throw new Error(
              payload.error ?? 'Erro ao carregar eventos da Visão Executiva.',
            )
          }

        const sellerRevenueRowsInPeriod = filterRevenueByPeriod(
          sellerRevenueRows,
          dateStart,
          dateEnd,
        )

        const extraRevenueRowsInPeriod = filterRevenueByPeriod(
          extraRevenueRows,
          dateStart,
          dateEnd,
        )

        const revenueBySeller = new Map<string, number>()

        for (const row of sellerRevenueRowsInPeriod) {
          revenueBySeller.set(
            row.seller_id,
            (revenueBySeller.get(row.seller_id) ?? 0) + Number(row.real_value ?? 0),
          )
        }

        const extraRevenue = extraRevenueRowsInPeriod.reduce(
          (sum, row) => sum + Number(row.real_value ?? 0),
          0,
        )

        setData(
          buildExecutiveData(
            payload.events ?? [],
            dateStart,
            dateEnd,
            selectedSellerId,
            isAdmin,
            resolvedCurrentUserId,
            selectedStage,
            sellers,
            revenueBySeller,
            extraRevenue,
            getTodayDate(),
          ),
        )
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar os dados.')
      } finally {
        setRefreshing(false)
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

  if (loading) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        Carregando Visão Executiva...
      </div>
    )
  }

  if (error && !data) {
    return (
      <div
        style={{
          alignItems: 'center',
          background: DS.contentBg,
          color: DS.textSecondary,
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100vh',
          padding: 24,
        }}
      >
        <div
          style={{
            background: DS.cardBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            maxWidth: 460,
            padding: 24,
            textAlign: 'center',
          }}
        >
          <strong style={{ color: DS.redSoft }}>Não foi possível carregar o relatório.</strong>
          <div style={{ marginTop: 8, fontSize: 13 }}>{error}</div>
        </div>
      </div>
    )
  }

  const totalClosed = (data?.won ?? 0) + (data?.lost ?? 0)
  const hasOperationalData =
    (data?.cyclesWithCommercialActivity ?? 0) > 0 ||
    (data?.revenue ?? 0) > 0

  return (
    <div
      style={{
        background: DS.contentBg,
        color: DS.textPrimary,
        minHeight: '100vh',
        overflowY: 'auto',
        padding: '32px 24px 80px',
      }}
    >
      <div style={{ margin: '0 auto', maxWidth: 1200 }}>
        <a
          href="/relatorios"
          style={{
            color: DS.textSecondary,
            display: 'inline-flex',
            fontSize: 13,
            marginBottom: 28,
            textDecoration: 'none',
          }}
        >
          ← Voltar para Relatórios
        </a>

        <div style={{ marginBottom: 30 }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 6 }}>
            <span style={{ color: DS.blueLight, fontSize: 22 }}>◔</span>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.01em', margin: 0 }}>
              Visão Executiva
            </h1>
          </div>
          <p style={{ color: DS.textSecondary, fontSize: 13, margin: 0 }}>
            Leitura operacional do período com faturamento conciliado na mesma base da Gestão de Faturamento.
          </p>
        </div>

        <div
          style={{
            borderBottom: `1px solid ${DS.border}`,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            marginBottom: 28,
          }}
        >
          {SUBNAV.map((tab) =>
            tab.href === null ? (
              <span
                key={tab.label}
                style={{
                  borderBottom: `2px solid ${DS.blueLight}`,
                  color: DS.blueLight,
                  fontSize: 13,
                  fontWeight: 800,
                  marginBottom: -1,
                  padding: '9px 14px',
                }}
              >
                {tab.label}
              </span>
            ) : (
              <a
                key={tab.label}
                href={tab.href}
                style={{
                  borderBottom: '2px solid transparent',
                  color: DS.textSecondary,
                  fontSize: 13,
                  marginBottom: -1,
                  padding: '9px 14px',
                  textDecoration: 'none',
                }}
              >
                {tab.label}
              </a>
            ),
          )}
        </div>

        <div
          style={{
            alignItems: 'flex-end',
            background: DS.cardBg,
            border: `1px solid ${DS.border}`,
            borderRadius: DS.radiusContainer,
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            marginBottom: 24,
            padding: '16px 20px',
          }}
        >
          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: DS.textLabel, fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              De
            </span>
            <input
              type="date"
              value={dateStart}
              onChange={(event) => setDateStart(event.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'grid', gap: 5 }}>
            <span style={{ color: DS.textLabel, fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Até
            </span>
            <input
              type="date"
              value={dateEnd}
              onChange={(event) => setDateEnd(event.target.value)}
              style={inputStyle}
            />
          </label>

          {isAdmin && (
            <label style={{ display: 'grid', gap: 5 }}>
              <span style={{ color: DS.textLabel, fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
                Consultor
              </span>
              <select
                value={selectedSellerId ?? ''}
                onChange={(event) => setSelectedSellerId(event.target.value || null)}
                style={{ ...inputStyle, minWidth: 190 }}
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
            <span style={{ color: DS.textLabel, fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
              Etapa
            </span>
            <select
              value={selectedStage}
              onChange={(event) => setSelectedStage(event.target.value)}
              style={{ ...inputStyle, minWidth: 160 }}
            >
              <option value="">Todas as etapas</option>
              {STAGES.map((stage) => (
                <option key={stage} value={stage}>
                  {STAGE_LABELS[stage] ?? stage}
                </option>
              ))}
            </select>
          </label>

          {refreshing && (
            <span style={{ color: DS.textSecondary, fontSize: 12, paddingBottom: 8 }}>
              Atualizando...
            </span>
          )}
        </div>

        {error && (
          <div
            style={{
              background: `${DS.red}12`,
              border: `1px solid ${DS.red}40`,
              borderRadius: DS.radius,
              color: DS.redSoft,
              fontSize: 13,
              marginBottom: 20,
              padding: '10px 14px',
            }}
          >
            {error}
          </div>
        )}

        {!hasOperationalData && !refreshing && (
          <div
            style={{
              background: DS.cardBg,
              border: `1px solid ${DS.border}`,
              borderRadius: DS.radiusContainer,
              color: DS.textSecondary,
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <div style={{ color: DS.textPrimary, fontWeight: 800, marginBottom: 6 }}>
              Nenhum dado operacional encontrado nesse período.
            </div>
            <div style={{ fontSize: 12 }}>
              O faturamento e a operação são consultados pela empresa ativa e pelos filtros acima.
            </div>
          </div>
        )}

        {data && hasOperationalData && (
          <>
            <section style={{ marginBottom: 36 }}>
              <SectionTitle title="Panorama do período" detail="Financeiro conciliado + atividade operacional registrada" />
              <div
                style={{
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))',
                }}
              >
                <KpiCard
                  label="Ciclos com atividade"
                  value={data.cyclesWithCommercialActivity}
                  detail="ciclos com ação, avanço, agenda ou fechamento"
                  accent={DS.blueLight}
                />
                <KpiCard
                  label="Atividades registradas"
                  value={data.commercialActivities}
                  detail="interações comerciais identificadas"
                  accent={DS.purple}
                />
                <KpiCard
                  label="Avanços"
                  value={data.advances}
                  detail={`${fmtPct(data.advanceRate)} de fluidez no funil`}
                  accent={DS.blueSoft}
                />
                <KpiCard
                  label="Ganhos"
                  value={data.won}
                  detail={totalClosed > 0 ? `${fmtPct(data.winRate)} dos fechamentos` : 'sem fechamentos registrados'}
                  accent={DS.greenSoft}
                />
                <KpiCard
                  label="Perdas"
                  value={data.lost}
                  detail={totalClosed > 0 ? `${fmtPct(100 - data.winRate)} dos fechamentos` : 'sem fechamentos registrados'}
                  accent={DS.redSoft}
                />
                <KpiCard
                  label="Faturamento real"
                  value={fmtCurrency(data.revenue)}
                  detail="mesma base da Gestão de Faturamento"
                  accent={DS.yellowSoft}
                />
              </div>
            </section>

            <section style={{ marginBottom: 36 }}>
              <SectionTitle title="Saúde da operação" detail="Indicadores que exigem atenção do gestor" />
              <div
                style={{
                  background: DS.cardBg,
                  border: `1px solid ${DS.border}`,
                  borderRadius: DS.radiusContainer,
                  padding: '8px 22px',
                }}
              >
                <MetricRow
                  label="Fluidez do funil"
                  value={fmtPct(data.advanceRate)}
                  description={
                    data.advanceRate >= 30
                      ? 'Avanços consistentes em relação às atividades e movimentações.'
                      : data.advanceRate >= 15
                      ? 'Parte relevante das ações ainda não está se convertendo em avanço.'
                      : 'Baixa progressão: revisar abordagem, etapa e qualidade da carteira.'
                  }
                  accent={data.advanceRate >= 30 ? DS.greenSoft : data.advanceRate >= 15 ? DS.yellowSoft : DS.redSoft}
                />
                <MetricRow
                  label="Disciplina de agenda"
                  value={fmtPct(data.disciplineRate)}
                  description="Percentual de ciclos com próxima ação definida no período."
                  accent={data.disciplineRate >= 50 ? DS.greenSoft : data.disciplineRate >= 25 ? DS.yellowSoft : DS.redSoft}
                />
                <MetricRow
                  label="Ações vencidas"
                  value={String(data.overdueNextActions)}
                  description={
                    data.nextActions > 0
                      ? `${fmtPct(safePct(data.overdueNextActions, data.nextActions))} das próximas ações identificadas estão atrasadas.`
                      : 'Não há próximas ações registradas no período.'
                  }
                  accent={data.overdueNextActions === 0 ? DS.greenSoft : data.overdueNextActions <= 3 ? DS.yellowSoft : DS.redSoft}
                />
                <MetricRow
                  label="Eficácia em fechamento"
                  value={totalClosed > 0 ? fmtPct(data.winRate) : '—'}
                  description={
                    totalClosed > 0
                      ? `${data.won} ganho(s) e ${data.lost} perda(s) registrados no período.`
                      : 'Ainda não existem fechamentos registrados para calcular a taxa.'
                  }
                  accent={data.winRate >= 30 ? DS.greenSoft : data.winRate >= 15 ? DS.yellowSoft : DS.redSoft}
                  isLast
                />
              </div>
            </section>

            <section style={{ marginBottom: 36 }}>
              <SectionTitle title="Diagnóstico executivo" detail="Onde está o problema e o que vale repetir" />
              <div
                style={{
                  display: 'grid',
                  gap: 14,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                }}
              >
                <div
                  style={{
                    background: DS.cardBg,
                    border: `1px solid ${DS.border}`,
                    borderRadius: DS.radiusContainer,
                    padding: 20,
                  }}
                >
                  <h2 style={cardTitleStyle}>Principal atenção</h2>
                  {data.mainBottleneck ? (
                    <InsightCard
                      accent={DS.redSoft}
                      title={`Travamento em ${data.mainBottleneck.label}`}
                      body={`${data.mainBottleneck.activities} atividade(s) e ${data.mainBottleneck.advances} avanço(s), com ${fmtPct(data.mainBottleneck.advanceRate)} de progressão.`}
                    />
                  ) : (
                    <EmptyInsight text="Ainda não há volume suficiente para apontar uma etapa crítica." />
                  )}

                  <div style={{ height: 12 }} />

                  <InsightCard
                    accent={data.overdueNextActions > 0 ? DS.yellowSoft : DS.greenSoft}
                    title={
                      data.overdueNextActions > 0
                        ? `${data.overdueNextActions} próxima(s) ação(ões) vencida(s)`
                        : 'Agenda sem atrasos identificados'
                    }
                    body={
                      data.overdueNextActions > 0
                        ? 'Priorize essas carteiras antes de aumentar a entrada de novos leads.'
                        : 'Nenhuma próxima ação vencida foi identificada entre os eventos analisados.'
                    }
                  />

                  {data.mainRiskSeller && (
                    <>
                      <div style={{ height: 12 }} />
                      <InsightCard
                        accent={DS.pink}
                        title={`Disciplina mais baixa: ${data.mainRiskSeller.sellerName}`}
                        body={`${fmtPct(data.mainRiskSeller.disciplineRate)} de ciclos com próxima ação definida em ${data.mainRiskSeller.cycles} ciclo(s) trabalhado(s).`}
                      />
                    </>
                  )}
                </div>

                <div
                  style={{
                    background: DS.cardBg,
                    border: `1px solid ${DS.border}`,
                    borderRadius: DS.radiusContainer,
                    padding: 20,
                  }}
                >
                  <h2 style={cardTitleStyle}>Melhores alavancas</h2>

                  {data.topAction ? (
                    <InsightCard
                      accent={DS.greenSoft}
                      title={`Ação com maior avanço: ${data.topAction.label}`}
                      body={`${fmtPct(data.topAction.advanceRate)} dos ciclos com essa ação avançaram. Base: ${data.topAction.cycles} ciclo(s).`}
                    />
                  ) : (
                    <EmptyInsight text="Ainda não há base suficiente para avaliar qual ação mais gera avanço." />
                  )}

                  <div style={{ height: 12 }} />

                  {data.topChannel ? (
                    <InsightCard
                      accent={DS.blueSoft}
                      title={`Canal com melhor fechamento: ${data.topChannel.label}`}
                      body={`${fmtPct(data.topChannel.winRate)} de conversão em ${data.topChannel.won + data.topChannel.lost} fechamento(s) atribuídos ao canal.`}
                    />
                  ) : (
                    <EmptyInsight text="Ainda não há fechamentos suficientes por canal para apontar um vencedor." />
                  )}

                  {data.topSeller && (
                    <>
                      <div style={{ height: 12 }} />
                      <InsightCard
                        accent={DS.yellowSoft}
                        title={`Maior faturamento: ${data.topSeller.sellerName}`}
                        body={`${fmtCurrency(data.topSeller.revenue)} no período, usando a mesma receita conciliada da Gestão de Faturamento.`}
                      />
                    </>
                  )}
                </div>
              </div>
            </section>

            <section style={{ marginBottom: 36 }}>
              <SectionTitle title="Aprofundar análise" detail="Abra o relatório específico para investigar cada indicador." />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {SUBNAV.filter((item) => item.href).map((item) => (
                  <a key={item.label} href={item.href!} style={navButtonStyle}>
                    {item.label}
                  </a>
                ))}
              </div>
            </section>

            <section
              style={{
                background: DS.surfaceBg,
                border: `1px solid ${DS.borderSubtle}`,
                borderRadius: DS.radius,
                color: DS.textMuted,
                fontSize: 11,
                lineHeight: 1.55,
                padding: '12px 14px',
              }}
            >
              <strong style={{ color: DS.textSecondary }}>Como esta página calcula os números:</strong>{' '}
              faturamento usa o valor real conciliado da Gestão de Faturamento; os demais indicadores usam eventos
              operacionais registrados no período. Eventos automáticos de criação, distribuição, grupo e IA não
              entram como atividade comercial.
            </section>
          </>
        )}
      </div>
    </div>
  )
}

function SectionTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div
        style={{
          color: DS.blueSoft,
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      >
        {title}
      </div>
      <div style={{ color: DS.textSecondary, fontSize: 12, marginTop: 4 }}>{detail}</div>
    </div>
  )
}

function EmptyInsight({ text }: { text: string }) {
  return (
    <div
      style={{
        background: DS.panelBg,
        border: `1px solid ${DS.borderSubtle}`,
        borderRadius: DS.radius,
        color: DS.textMuted,
        fontSize: 12,
        lineHeight: 1.5,
        padding: '12px 14px',
      }}
    >
      {text}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  background: DS.panelBg,
  border: `1px solid ${DS.border}`,
  borderRadius: DS.radius,
  color: DS.textPrimary,
  colorScheme: 'dark',
  fontSize: 13,
  outline: 'none',
  padding: '7px 10px',
}

const cardTitleStyle: React.CSSProperties = {
  color: DS.textPrimary,
  fontSize: 14,
  fontWeight: 900,
  margin: '0 0 14px',
}

const navButtonStyle: React.CSSProperties = {
  background: DS.panelBg,
  border: `1px solid ${DS.border}`,
  borderRadius: DS.radius,
  color: DS.textSecondary,
  fontSize: 12,
  fontWeight: 700,
  padding: '8px 12px',
  textDecoration: 'none',
}
