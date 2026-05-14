'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import {
  getActiveCompetency,
  getGroupConversion,
  getRevenueSummary,
  getSalesCycleMetrics,
} from '@/app/lib/services/simulator'
import type {
  ActiveCompetency,
  GroupConversionRow,
  RevenueSummaryResponse,
  SimulatorMetrics,
} from '@/app/types/simulator'

type LeadStatus =
  | 'novo'
  | 'contato'
  | 'respondeu'
  | 'negociacao'
  | 'pausado'
  | 'ganho'
  | 'perdido'
  | 'cancelado'
  | string

type Lead = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
}

type Profile = {
  id: string
  company_id?: string | null
  role?: string | null
  full_name: string | null
  email: string | null
}

type ApiMeResponse = {
  ok?: boolean
  user_id?: string
  profile_id?: string
  full_name?: string | null
  email?: string | null
  active_company_id?: string | null
  active_role?: string | null
  error?: string
}

type SalesCycle = {
  id: string
  company_id: string
  lead_id: string | null
  owner_user_id: string | null
  status: LeadStatus | null
  previous_status: LeadStatus | null
  stage_entered_at: string | null
  next_action: string | null
  next_action_date: string | null
  current_group_id: string | null
  created_at: string | null
  updated_at: string | null
  closed_at: string | null
  won_at: string | null
  lost_at: string | null
  won_owner_user_id: string | null
  lost_owner_user_id: string | null
  lost_reason: string | null
  won_total: number | null
  paused_at: string | null
  canceled_at: string | null
  leads?: Lead | Lead[] | null
}

type DashboardStatusCounts = {
  novo: number
  contato: number
  respondeu: number
  negociacao: number
  ganho: number
  perdido: number
}

type DashboardState = {
  profile: Profile | null
  competency: ActiveCompetency | null
  simulatorMetrics: SimulatorMetrics | null
  revenueSummary: RevenueSummaryResponse | null
  groupConversion: GroupConversionRow[]
  cycles: SalesCycle[]
  owners: Record<string, Profile>
  poolOperationalTotal: number | null
  inProgressOperationalTotal: number | null
  operationalFunnelCounts: DashboardStatusCounts | null
}

const STATUS_ORDER: Array<keyof DashboardStatusCounts> = [
  'novo',
  'contato',
  'respondeu',
  'negociacao',
  'ganho',
  'perdido',
]

const EMPTY_STATUS_COUNTS: DashboardStatusCounts = {
  novo: 0,
  contato: 0,
  respondeu: 0,
  negociacao: 0,
  ganho: 0,
  perdido: 0,
}

const STATUS_LABELS: Record<string, string> = {
  novo: 'Novo',
  contato: 'Contato',
  respondeu: 'Respondeu',
  negociacao: 'Negociação',
  pausado: 'Pausado',
  ganho: 'Ganho',
  perdido: 'Perdido',
  cancelado: 'Cancelado',
}

const STATUS_COLORS: Record<string, string> = {
  novo: '#3b82f6',
  contato: '#06b6d4',
  respondeu: '#f59e0b',
  negociacao: '#a855f7',
  pausado: '#64748b',
  ganho: '#22c55e',
  perdido: '#ef4444',
  cancelado: '#94a3b8',
}

const moneyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const numberFormatter = new Intl.NumberFormat('pt-BR')

function toYMD(value?: string | null) {
  return String(value || '').split('T')[0].split(' ')[0]
}

function normalizeStatus(status?: LeadStatus | null) {
  return String(status || 'sem_status').trim().toLowerCase()
}

function formatMoney(value: number) {
  return moneyFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatNumber(value: number) {
  return numberFormatter.format(Number.isFinite(value) ? value : 0)
}

function formatPercent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0

  return `${safeValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatRatioPercent(value: number) {
  return formatPercent((Number.isFinite(value) ? value : 0) * 100)
}

function formatDate(value?: string | null) {
  if (!value) return 'Sem data'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return 'Data inválida'

  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

function formatCompetency(competency: ActiveCompetency | null) {
  if (!competency?.month_start) return 'Competência atual'

  const [year, month] = toYMD(competency.month_start).split('-')
  const date = new Date(Number(year), Number(month) - 1, 1)

  return date.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  })
}

function getTime(value?: string | null) {
  if (!value) return 0

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

function getStatusLabel(status?: LeadStatus | null) {
  const normalized = normalizeStatus(status)

  return STATUS_LABELS[normalized] || status || 'Sem status'
}

function isOpenStatus(status?: LeadStatus | null) {
  return ['novo', 'contato', 'respondeu', 'negociacao', 'pausado'].includes(
    normalizeStatus(status)
  )
}

function isWonCycle(cycle: SalesCycle) {
  return normalizeStatus(cycle.status) === 'ganho' || Boolean(cycle.won_at)
}

function isLostCycle(cycle: SalesCycle) {
  return normalizeStatus(cycle.status) === 'perdido' || Boolean(cycle.lost_at)
}

function getCyclePeriodDate(cycle: SalesCycle) {
  if (isWonCycle(cycle)) return cycle.won_at
  if (isLostCycle(cycle)) return cycle.lost_at || cycle.closed_at
  return cycle.created_at
}

function isCycleInsideCompetency(
  cycle: SalesCycle,
  competency: ActiveCompetency | null
) {
  if (!competency) return true

  const refDate = toYMD(getCyclePeriodDate(cycle))
  const start = toYMD(competency.month_start)
  const end = toYMD(competency.month_end)

  if (!refDate || !start || !end) return false

  return refDate >= start && refDate <= end
}

function getLeadFromCycle(cycle: SalesCycle) {
  const lead = cycle.leads

  if (Array.isArray(lead)) return lead[0] ?? null

  return lead ?? null
}

function getLeadLabel(cycle: SalesCycle) {
  const lead = getLeadFromCycle(cycle)

  return lead?.name || lead?.phone || lead?.email || cycle.lead_id || 'Lead sem identificação'
}

function getOwnerLabel(ownerId: string | null, owners: Record<string, Profile>) {
  if (!ownerId) return 'Pool'

  const owner = owners[ownerId]

  return owner?.full_name || owner?.email || 'Responsável não identificado'
}

function Card({
  title,
  value,
  description,
  accent,
}: {
  title: string
  value: string
  description: string
  accent: string
}) {
  return (
    <div
      style={{
        border: `1px solid ${accent}33`,
        background: `linear-gradient(135deg, ${accent}1f, rgba(13,15,20,0.96))`,
        borderRadius: 18,
        padding: 18,
        minHeight: 128,
        boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontWeight: 850,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 10,
          color: '#f8fafc',
          fontSize: 26,
          fontWeight: 900,
          letterSpacing: '-0.04em',
        }}
      >
        {value}
      </div>

      <div
        style={{
          marginTop: 8,
          color: '#94a3b8',
          fontSize: 13,
          lineHeight: 1.45,
        }}
      >
        {description}
      </div>
    </div>
  )
}

function Panel({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section
      style={{
        background: '#0d0f14',
        border: '1px solid #1a1d2e',
        borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 18px 60px rgba(0,0,0,0.26)',
      }}
    >
      <div
        style={{
          padding: '16px 18px',
          borderBottom: '1px solid #1a1d2e',
        }}
      >
        <h2
          style={{
            margin: 0,
            color: '#f8fafc',
            fontSize: 15,
            fontWeight: 900,
          }}
        >
          {title}
        </h2>

        {description ? (
          <p
            style={{
              margin: '6px 0 0',
              color: '#64748b',
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {description}
          </p>
        ) : null}
      </div>

      <div style={{ padding: 18 }}>{children}</div>
    </section>
  )
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: 22,
        border: '1px dashed #334155',
        borderRadius: 14,
        color: '#64748b',
        fontSize: 13,
        textAlign: 'center',
        background: '#090b0f',
      }}
    >
      {text}
    </div>
  )
}

function Bar({
  label,
  value,
  max,
  color,
  detail,
}: {
  label: string
  value: number
  max: number
  color: string
  detail?: string
}) {
  const width = max > 0 ? Math.max(4, Math.min(100, (value / max) * 100)) : 0

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 12,
          alignItems: 'baseline',
        }}
      >
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 800 }}>
            {label}
          </div>

          {detail ? (
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
              {detail}
            </div>
          ) : null}
        </div>

        <div style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 900 }}>
          {formatNumber(value)}
        </div>
      </div>

      <div
        style={{
          height: 8,
          background: '#111827',
          borderRadius: 999,
          overflow: 'hidden',
          border: '1px solid #1f2937',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${width}%`,
            background: color,
            borderRadius: 999,
          }}
        />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const [state, setState] = useState<DashboardState>({
    profile: null,
    competency: null,
    simulatorMetrics: null,
    revenueSummary: null,
    groupConversion: [],
    cycles: [],
    owners: {},
    poolOperationalTotal: null,
    inProgressOperationalTotal: null,
    operationalFunnelCounts: null,
  })

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)

  const loadDashboard = useCallback(async () => {
    const supabase = supabaseBrowser()

    setLoading(true)
    setError(null)

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser()

      if (authError || !auth?.user?.id) {
        throw new Error('Sessão não encontrada. Faça login novamente.')
      }

      const userId = auth.user.id

      const meResponse = await fetch('/api/me', {
        cache: 'no-store',
      })

      const me = (await meResponse.json().catch(() => null)) as ApiMeResponse | null

      if (!meResponse.ok || !me?.ok) {
        throw new Error(me?.error || 'Erro ao carregar empresa ativa.')
      }

      if (!me.active_company_id) {
        throw new Error('Empresa ativa não selecionada.')
      }

      const companyId = me.active_company_id
      const activeRole = me.active_role ?? null

      const profile: Profile = {
        id: userId,
        company_id: companyId,
        role: activeRole,
        full_name: me.full_name ?? null,
        email: me.email ?? auth.user.email ?? null,
      }

      const isAdmin = activeRole === 'admin' || activeRole === 'manager'
      const ownerScope = isAdmin ? null : userId

      const competency = await getActiveCompetency()
      const startDate = toYMD(competency.month_start)
      const endDate = toYMD(competency.month_end)

      const [
        simulatorMetrics,
        revenueSummary,
        groupConversion,
        poolOperationalTotal,
        inProgressOperationalTotal,
        operationalFunnelCounts,
      ] = await Promise.all([
        getSalesCycleMetrics({
          companyId,
          ownerUserId: ownerScope,
          month: competency.month,
        }),
        getRevenueSummary({
          companyId,
          ownerId: ownerScope,
          startDate,
          endDate,
          metric: 'faturamento',
        }),
        getGroupConversion({
          companyId,
          ownerId: ownerScope,
          dateStart: startDate,
          dateEnd: endDate,
        }),
        isAdmin
          ? fetch('/api/pool/cycles?page=1&page_size=1', {
              cache: 'no-store',
            }).then(async (response) => {
              const json = (await response.json().catch(() => null)) as {
                ok?: boolean
                total?: number
                error?: string
              } | null

              if (!response.ok || !json?.ok) {
                throw new Error(json?.error || 'Erro ao carregar total oficial do Pool.')
              }

              return Number(json.total ?? 0)
            })
          : Promise.resolve(null),
        supabase
          .from('v_pipeline_items')
          .select('id', { head: true, count: 'exact' })
          .eq('company_id', companyId)
          .not('owner_id', 'is', null)
          .neq('status', 'ganho')
          .neq('status', 'perdido')
          .neq('status', 'cancelado')
          .then(
            (result: {
              count: number | null
              error: { message: string } | null
            }) => {
              const { count, error: inProgressError } = result

              if (inProgressError) {
                throw new Error(
                  `Erro ao carregar atendimentos em andamento: ${inProgressError.message}`
                )
              }

              return count ?? 0
            }
          ),
        supabase
          .from('v_pipeline_items')
          .select('status')
          .eq('company_id', companyId)
          .not('owner_id', 'is', null)
          .then(
            (result: {
              data: Array<{ status: string | null }> | null
              error: { message: string } | null
            }) => {
              const { data, error: funnelError } = result

              if (funnelError) {
                throw new Error(
                  `Erro ao carregar funil dos vendedores: ${funnelError.message}`
                )
              }

              const counts: DashboardStatusCounts = { ...EMPTY_STATUS_COUNTS }

              for (const row of data ?? []) {
                const status = normalizeStatus(row.status)

                if (status in counts) {
                  counts[status as keyof DashboardStatusCounts] += 1
                }
              }

              return counts
            }
          ),
      ])

      let cyclesQuery = supabase
        .from('sales_cycles')
        .select(`
          id,
          company_id,
          lead_id,
          owner_user_id,
          status,
          previous_status,
          stage_entered_at,
          next_action,
          next_action_date,
          current_group_id,
          created_at,
          updated_at,
          closed_at,
          won_at,
          lost_at,
          won_owner_user_id,
          lost_owner_user_id,
          lost_reason,
          won_total,
          paused_at,
          canceled_at,
          leads:lead_id (
            id,
            name,
            phone,
            email
          )
        `)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .range(0, 4999)

      if (!isAdmin) {
        cyclesQuery = cyclesQuery.eq('owner_user_id', userId)
      }

      const { data: cyclesData, error: cyclesError } = await cyclesQuery

      if (cyclesError) {
        throw new Error(`Erro ao carregar ciclos reais: ${cyclesError.message}`)
      }

      const cycles = (cyclesData || []) as SalesCycle[]

      const ownerIds = Array.from(
        new Set(
          cycles
            .flatMap((cycle) => [
              cycle.owner_user_id,
              cycle.won_owner_user_id,
              cycle.lost_owner_user_id,
            ])
            .filter(Boolean)
        )
      ) as string[]

      let owners: Record<string, Profile> = {}

      if (ownerIds.length > 0) {
        const { data: ownersData, error: ownersError } = await supabase
          .from('profiles')
          .select('id, full_name, email, role')
          .in('id', ownerIds)

        if (ownersError) {
          throw new Error(`Erro ao carregar responsáveis: ${ownersError.message}`)
        }

        owners = Object.fromEntries(
          ((ownersData || []) as Profile[]).map((owner) => [owner.id, owner])
        )
      }

      setState({
        profile: profile as Profile,
        competency,
        simulatorMetrics,
        revenueSummary,
        groupConversion,
        cycles,
        owners,
        poolOperationalTotal,
        inProgressOperationalTotal,
        operationalFunnelCounts,
      })

      setUpdatedAt(new Date().toISOString())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dashboard.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const periodCycles = useMemo(() => {
    return state.cycles.filter((cycle) =>
      isCycleInsideCompetency(cycle, state.competency)
    )
  }, [state.cycles, state.competency])

  const dashboardMetrics = useMemo(() => {
    const metrics = state.simulatorMetrics

    const periodCounts: DashboardStatusCounts = metrics?.counts_by_status ?? {
      novo: periodCycles.filter((cycle) => normalizeStatus(cycle.status) === 'novo').length,
      contato: periodCycles.filter((cycle) => normalizeStatus(cycle.status) === 'contato').length,
      respondeu: periodCycles.filter((cycle) => normalizeStatus(cycle.status) === 'respondeu').length,
      negociacao: periodCycles.filter((cycle) => normalizeStatus(cycle.status) === 'negociacao').length,
      ganho: periodCycles.filter(isWonCycle).length,
      perdido: periodCycles.filter(isLostCycle).length,
    }

    const operationalCounts: DashboardStatusCounts =
      state.operationalFunnelCounts ?? {
        ...EMPTY_STATUS_COUNTS,
      }

    const worked = metrics?.worked_count ?? periodCycles.length
    const wins = metrics?.current_wins ?? periodCounts.ganho
    const losses = periodCounts.perdido
    const revenue = Number(state.revenueSummary?.total_real || 0)
    const totalInProgress =
      state.inProgressOperationalTotal ??
      periodCycles.filter((cycle) => cycle.owner_user_id && isOpenStatus(cycle.status)).length

    const totalPool =
      state.poolOperationalTotal ??
      metrics?.total_pool ??
      periodCycles.filter((cycle) => !cycle.owner_user_id && isOpenStatus(cycle.status)).length

    const conversion = worked > 0 ? (wins / worked) * 100 : 0
    const closingRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0
    const averageTicket = wins > 0 ? revenue / wins : 0

    return {
      counts: operationalCounts,
      periodCounts,
      worked,
      wins,
      losses,
      revenue,
      totalInProgress,
      totalPool,
      conversion,
      closingRate,
      averageTicket,
    }
  }, [
    periodCycles,
    state.inProgressOperationalTotal,
    state.operationalFunnelCounts,
    state.poolOperationalTotal,
    state.revenueSummary,
    state.simulatorMetrics,
  ])

  const funnel = useMemo(() => {
    return STATUS_ORDER.map((status) => ({
      status,
      label: getStatusLabel(status),
      total: Number(
        dashboardMetrics.counts[
          status as keyof typeof dashboardMetrics.counts
        ] || 0
      ),
      color: STATUS_COLORS[status] || '#64748b',
    })).filter((item) => item.total > 0)
  }, [dashboardMetrics])

  const maxFunnel = useMemo(() => {
    return Math.max(...funnel.map((item) => item.total), 1)
  }, [funnel])

  const upcoming = useMemo(() => {
    return state.cycles
      .filter(
        (cycle) =>
          cycle.owner_user_id &&
          isOpenStatus(cycle.status) &&
          cycle.next_action_date
      )
      .sort((a, b) => getTime(a.next_action_date) - getTime(b.next_action_date))
      .slice(0, 8)
  }, [state.cycles])

  const risks = useMemo(() => {
    const activeAssignedCycles = state.cycles.filter(
      (cycle) => cycle.owner_user_id && isOpenStatus(cycle.status)
    )

    const now = Date.now()

    const overdue = activeAssignedCycles.filter((cycle) => {
      const nextActionTime = getTime(cycle.next_action_date)
      return nextActionTime > 0 && nextActionTime < now
    })

    const withoutNextAction = activeAssignedCycles.filter(
      (cycle) => !cycle.next_action_date
    )

    const idle = activeAssignedCycles.filter((cycle) => {
      const enteredAt = getTime(cycle.stage_entered_at)

      if (!enteredAt) return false

      const hours = (now - enteredAt) / 1000 / 60 / 60

      return hours >= 72
    })

    return {
      overdue: overdue.length,
      withoutNextAction: withoutNextAction.length,
      idle: idle.length,
    }
  }, [state.cycles])

  const sellerRanking = useMemo(() => {
    const map = new Map<
      string,
      {
        ownerId: string
        label: string
        worked: number
        wins: number
        losses: number
        revenue: number
      }
    >()

    for (const cycle of periodCycles) {
      let ownerId = cycle.owner_user_id

      if (isWonCycle(cycle)) {
        ownerId = cycle.won_owner_user_id || cycle.owner_user_id
      } else if (isLostCycle(cycle)) {
        ownerId = cycle.lost_owner_user_id || cycle.owner_user_id
      }

      if (!ownerId) continue

      const key = ownerId

      if (!map.has(key)) {
        map.set(key, {
          ownerId,
          label: getOwnerLabel(ownerId, state.owners),
          worked: 0,
          wins: 0,
          losses: 0,
          revenue: 0,
        })
      }

      const current = map.get(key)!

      current.worked += 1

      if (isWonCycle(cycle)) {
        current.wins += 1
        current.revenue += Number(cycle.won_total || 0)
      }

      if (isLostCycle(cycle)) {
        current.losses += 1
      }
    }

    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 8)
  }, [periodCycles, state.owners])

  const lostReasons = useMemo(() => {
    const map = new Map<string, number>()

    for (const cycle of periodCycles.filter(isLostCycle)) {
      const reason = cycle.lost_reason?.trim() || 'Sem motivo registrado'
      map.set(reason, (map.get(reason) || 0) + 1)
    }

    return Array.from(map.entries())
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [periodCycles])

  const maxLostReason = Math.max(...lostReasons.map((item) => item.total), 1)

  const maxGroupWorked = Math.max(
    ...state.groupConversion.map((item) => Number(item.trabalhados || 0)),
    1
  )

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#090b0f',
        color: '#f8fafc',
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 1440, margin: '0 auto', display: 'grid', gap: 18 }}>
        <header
          style={{
            border: '1px solid #1a1d2e',
            background:
              'radial-gradient(circle at top left, rgba(37,99,235,0.22), transparent 32%), linear-gradient(135deg, #0d0f14, #111318)',
            borderRadius: 24,
            padding: 24,
            boxShadow: '0 24px 80px rgba(0,0,0,0.35)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 20,
              alignItems: 'flex-start',
              flexWrap: 'wrap',
            }}
          >
            <div>
              <div
                style={{
                  display: 'inline-flex',
                  border: '1px solid rgba(59,130,246,0.25)',
                  background: 'rgba(59,130,246,0.10)',
                  color: '#bfdbfe',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 11,
                  fontWeight: 850,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                }}
              >
                Dashboard da competência
              </div>

              <h1
                style={{
                  margin: '14px 0 0',
                  fontSize: 30,
                  lineHeight: 1.05,
                  letterSpacing: '-0.05em',
                  fontWeight: 900,
                }}
              >
                Cockpit da operação comercial
              </h1>

              <p
                style={{
                  margin: '10px 0 0',
                  color: '#94a3b8',
                  maxWidth: 860,
                  lineHeight: 1.55,
                  fontSize: 14,
                }}
              >
                Esta página usa a mesma competência, as mesmas métricas do Simulador
                de Meta e o mesmo faturamento real da Gestão de Faturamento.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
              }}
            >
              <div
                style={{
                  border: '1px solid #1a1d2e',
                  background: '#0d0f14',
                  borderRadius: 14,
                  padding: '10px 12px',
                  color: '#94a3b8',
                  fontSize: 12,
                }}
              >
                Competência:{' '}
                <strong style={{ color: '#e2e8f0' }}>
                  {formatCompetency(state.competency)}
                </strong>
              </div>

              <button
                onClick={() => void loadDashboard()}
                disabled={loading}
                style={{
                  border: '1px solid rgba(59,130,246,0.35)',
                  background: loading ? '#111827' : '#2563eb',
                  color: '#eff6ff',
                  borderRadius: 14,
                  padding: '10px 14px',
                  fontSize: 12,
                  fontWeight: 850,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.65 : 1,
                }}
              >
                {loading ? 'Atualizando...' : 'Atualizar'}
              </button>
            </div>
          </div>

          {updatedAt ? (
            <div style={{ marginTop: 14, color: '#64748b', fontSize: 12 }}>
              Última leitura: {formatDate(updatedAt)}
            </div>
          ) : null}
        </header>

        {error ? (
          <div
            style={{
              border: '1px solid rgba(239,68,68,0.35)',
              background: 'rgba(239,68,68,0.10)',
              color: '#fecaca',
              borderRadius: 16,
              padding: 16,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          <Card
            title="Faturamento real"
            value={loading ? '...' : formatMoney(dashboardMetrics.revenue)}
            description="Mesmo valor usado na Gestão de Faturamento para a competência."
            accent="#22c55e"
          />

          <Card
            title="Oportunidades trabalhadas"
            value={loading ? '...' : formatNumber(dashboardMetrics.worked)}
            description="Base comercial movimentada no período."
            accent="#3b82f6"
          />

          <Card
            title="Vendas no período"
            value={loading ? '...' : formatNumber(dashboardMetrics.wins)}
            description="Mesmo indicador de ganhos usado pelo Simulador de Meta."
            accent="#10b981"
          />

          <Card
            title="Conversão do período"
            value={loading ? '...' : formatPercent(dashboardMetrics.conversion)}
            description="Vendas sobre oportunidades trabalhadas."
            accent={dashboardMetrics.conversion >= 20 ? '#22c55e' : '#f59e0b'}
          />

<Card
            title="Atendimentos em andamento"
            value={loading ? '...' : formatNumber(dashboardMetrics.totalInProgress)}
            description="Oportunidades com vendedor e ainda não finalizadas."
            accent="#8b5cf6"
          />

<Card
            title="Pool atual"
            value={loading ? '...' : formatNumber(dashboardMetrics.totalPool)}
            description="Oportunidades operacionais sem responsável."
            accent="#a855f7"
          />
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.1fr) minmax(360px, 0.9fr)',
            gap: 18,
          }}
        >
          <Panel
            title="Funil dos vendedores"
            description="Distribuição atual das oportunidades que já estão com responsáveis."
          >
            {loading ? (
              <Empty text="Carregando funil..." />
            ) : funnel.length === 0 ? (
              <Empty text="Nenhuma oportunidade com vendedor encontrada." />
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {funnel.map((item) => (
                  <Bar
                    key={item.status}
                    label={item.label}
                    value={item.total}
                    max={maxFunnel}
                    color={item.color}
                    detail={`Status técnico: ${item.status}`}
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Agenda comercial"
            description="Próximas ações reais das oportunidades com responsável."
          >
            {loading ? (
              <Empty text="Carregando próximas ações..." />
            ) : upcoming.length === 0 ? (
              <Empty text="Nenhuma próxima ação encontrada para oportunidades com responsável. Se existem atendimentos em andamento, isso indica falha de follow-up." />
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {upcoming.map((cycle) => (
                  <div
                    key={cycle.id}
                    style={{
                      border: '1px solid #1a1d2e',
                      background: '#090b0f',
                      borderRadius: 14,
                      padding: 14,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 12,
                        alignItems: 'flex-start',
                      }}
                    >
                      <div>
                        <div style={{ color: '#f8fafc', fontWeight: 850, fontSize: 13 }}>
                          {getLeadLabel(cycle)}
                        </div>

                        <div style={{ color: '#64748b', fontSize: 12, marginTop: 4 }}>
                          {cycle.next_action || 'Ação sem descrição'}
                        </div>
                      </div>

                      <div
                        style={{
                          color: STATUS_COLORS[normalizeStatus(cycle.status)] || '#94a3b8',
                          border: `1px solid ${
                            STATUS_COLORS[normalizeStatus(cycle.status)] || '#94a3b8'
                          }55`,
                          borderRadius: 999,
                          padding: '4px 8px',
                          fontSize: 10,
                          fontWeight: 850,
                        }}
                      >
                        {getStatusLabel(cycle.status)}
                      </div>
                    </div>

                    <div
                      style={{
                        marginTop: 10,
                        color: '#94a3b8',
                        fontSize: 12,
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: 10,
                      }}
                    >
                      <span>{formatDate(cycle.next_action_date)}</span>
                      <span>{getOwnerLabel(cycle.owner_user_id, state.owners)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 18,
          }}
        >
          <Panel
            title="Performance por responsável"
            description="Performance de oportunidades com responsável dentro da competência atual."
          >
            {loading ? (
              <Empty text="Carregando responsáveis..." />
            ) : sellerRanking.length === 0 ? (
              <Empty text="Nenhum responsável encontrado no período." />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ color: '#64748b', textAlign: 'left' }}>
                      <th style={{ padding: '0 0 10px' }}>Responsável</th>
                      <th style={{ padding: '0 0 10px' }}>Trab.</th>
                      <th style={{ padding: '0 0 10px' }}>Ganhos</th>
                      <th style={{ padding: '0 0 10px' }}>Perdidos</th>
                      <th style={{ padding: '0 0 10px' }}>Won Total</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sellerRanking.map((seller) => (
                      <tr
                        key={seller.ownerId || 'pool'}
                        style={{ borderTop: '1px solid #1a1d2e' }}
                      >
                        <td style={{ padding: '11px 0', color: '#e2e8f0', fontWeight: 750 }}>
                          {seller.label}
                        </td>
                        <td style={{ padding: '11px 0', color: '#cbd5e1' }}>
                          {formatNumber(seller.worked)}
                        </td>
                        <td style={{ padding: '11px 0', color: '#86efac' }}>
                          {formatNumber(seller.wins)}
                        </td>
                        <td style={{ padding: '11px 0', color: '#fca5a5' }}>
                          {formatNumber(seller.losses)}
                        </td>
                        <td style={{ padding: '11px 0', color: '#bfdbfe', fontWeight: 850 }}>
                          {formatMoney(seller.revenue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          <Panel
            title="Riscos operacionais atuais"
            description="Riscos sobre oportunidades com responsável agora, não sobre Pool nem histórico encerrado."
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
              }}
            >
              <Card
                title="Atrasados"
                value={loading ? '...' : formatNumber(risks.overdue)}
                description="Próximas ações vencidas."
                accent="#ef4444"
              />

              <Card
                title="Sem próxima ação"
                value={loading ? '...' : formatNumber(risks.withoutNextAction)}
                description="Ciclos abertos sem follow-up marcado."
                accent="#f59e0b"
              />

              <Card
                title="Parados 72h+"
                value={loading ? '...' : formatNumber(risks.idle)}
                description="Ciclos sem mudança recente de etapa."
                accent="#a855f7"
              />

              <Card
                title="Ticket médio real"
                value={loading ? '...' : formatMoney(dashboardMetrics.averageTicket)}
                description="Faturamento real dividido pelas vendas do período."
                accent="#06b6d4"
              />
            </div>
          </Panel>
        </section>

        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
            gap: 18,
          }}
        >
          <Panel
            title="Motivos de perda"
            description="Perdas da competência atual, usando lost_reason dos ciclos perdidos."
          >
            {loading ? (
              <Empty text="Carregando perdas..." />
            ) : lostReasons.length === 0 ? (
              <Empty text="Nenhum motivo de perda encontrado na competência." />
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {lostReasons.map((item) => (
                  <Bar
                    key={item.reason}
                    label={item.reason}
                    value={item.total}
                    max={maxLostReason}
                    color="#ef4444"
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel
            title="Conversão por grupo"
            description="Mesma leitura de grupos usada no Simulador de Meta."
          >
            {loading ? (
              <Empty text="Carregando grupos..." />
            ) : state.groupConversion.length === 0 ? (
              <Empty text="Nenhum grupo encontrado no período." />
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {state.groupConversion.map((row, index) => (
                  <Bar
                    key={row.group_id || `${row.group_name}-${index}`}
                    label={row.group_name || 'Sem grupo'}
                    value={Number(row.trabalhados || 0)}
                    max={maxGroupWorked}
                    color={Number(row.ganho || 0) > 0 ? '#22c55e' : '#3b82f6'}
                    detail={`${formatNumber(Number(row.ganho || 0))} vendas · ${formatRatioPercent(
                      Number(row.pct_grupo || 0)
                    )} conversão`}
                  />
                ))}
              </div>
            )}
          </Panel>
        </section>
      </div>
    </main>
  )
}