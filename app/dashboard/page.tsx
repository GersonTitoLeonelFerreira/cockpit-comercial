'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'

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
    leads?: Lead | null
  }

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

type LeadGroup = {
  id: string
  name: string | null
}

type DashboardState = {
  profile: Profile | null
  cycles: SalesCycle[]
  leads: Record<string, Lead>
  owners: Record<string, Profile>
  groups: Record<string, LeadGroup>
}

const OPEN_STATUSES = ['novo', 'contato', 'respondeu', 'negociacao', 'pausado']
const CLOSED_STATUSES = ['ganho', 'perdido', 'cancelado']
const STATUS_ORDER = ['novo', 'contato', 'respondeu', 'negociacao', 'pausado', 'ganho', 'perdido', 'cancelado']

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

const money = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

const number = new Intl.NumberFormat('pt-BR')

function normalizeStatus(status: LeadStatus | null | undefined) {
  return String(status || 'sem_status').trim().toLowerCase()
}

function formatMoney(value: number) {
  return money.format(Number.isFinite(value) ? value : 0)
}

function formatNumber(value: number) {
  return number.format(Number.isFinite(value) ? value : 0)
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) return '0,0%'
  return `${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`
}

function formatDate(value: string | null | undefined) {
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

function getTime(value: string | null | undefined) {
  if (!value) return 0

  const time = new Date(value).getTime()

  return Number.isNaN(time) ? 0 : time
}

function isOpenCycle(cycle: SalesCycle) {
  return OPEN_STATUSES.includes(normalizeStatus(cycle.status))
}

function isWonCycle(cycle: SalesCycle) {
  return normalizeStatus(cycle.status) === 'ganho' || Boolean(cycle.won_at)
}

function isLostCycle(cycle: SalesCycle) {
  return normalizeStatus(cycle.status) === 'perdido' || Boolean(cycle.lost_at)
}

function getStatusLabel(status: LeadStatus | null | undefined) {
  const normalized = normalizeStatus(status)
  return STATUS_LABELS[normalized] || status || 'Sem status'
}

function getLeadLabel(cycle: SalesCycle, leads: Record<string, Lead>) {
  if (!cycle.lead_id) return 'Lead sem vínculo'

  const lead = leads[cycle.lead_id]

  return lead?.name || lead?.phone || lead?.email || cycle.lead_id
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
  accent = '#3b82f6',
}: {
  title: string
  value: string
  description: string
  accent?: string
}) {
  return (
    <div
      style={{
        border: `1px solid ${accent}33`,
        background: `linear-gradient(135deg, ${accent}1f, rgba(13,15,20,0.96))`,
        borderRadius: 18,
        padding: 18,
        boxShadow: '0 18px 50px rgba(0,0,0,0.28)',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#64748b',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontWeight: 800,
        }}
      >
        {title}
      </div>

      <div
        style={{
          marginTop: 10,
          color: '#f8fafc',
          fontSize: 26,
          fontWeight: 850,
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
            fontWeight: 850,
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
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 750 }}>
            {label}
          </div>

          {detail ? (
            <div style={{ color: '#64748b', fontSize: 11, marginTop: 2 }}>
              {detail}
            </div>
          ) : null}
        </div>

        <div style={{ color: '#cbd5e1', fontSize: 12, fontWeight: 800 }}>
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
    cycles: [],
    leads: {},
    owners: {},
    groups: {},
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

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, company_id, role, full_name, email')
        .eq('id', userId)
        .single()

      if (profileError || !profile?.company_id) {
        throw new Error('Perfil do usuário não encontrado.')
      }

      const isAdmin = profile.role === 'admin'

      let query = supabase
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
        .eq('company_id', profile.company_id)
        .order('created_at', { ascending: false })
        .range(0, 4999)

      if (!isAdmin) {
        query = query.eq('owner_user_id', userId)
      }

      const { data: cyclesData, error: cyclesError } = await query

      if (cyclesError) {
        throw new Error(`Erro ao carregar ciclos reais: ${cyclesError.message}`)
      }

      const cycles = (cyclesData || []) as SalesCycle[]

      const leads = Object.fromEntries(
        cycles
          .map((cycle) => cycle.leads)
          .filter(Boolean)
          .map((lead) => [lead!.id, lead!])
      )

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

      const groupIds = Array.from(
        new Set(cycles.map((cycle) => cycle.current_group_id).filter(Boolean))
      ) as string[]

      let owners: Record<string, Profile> = {}
      let groups: Record<string, LeadGroup> = {}

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

      if (groupIds.length > 0) {
        const { data: groupsData, error: groupsError } = await supabase
          .from('lead_groups')
          .select('id, name')
          .in('id', groupIds)

        if (groupsError) {
          throw new Error(`Erro ao carregar grupos: ${groupsError.message}`)
        }

        groups = Object.fromEntries(
          ((groupsData || []) as LeadGroup[]).map((group) => [group.id, group])
        )
      }

      setState({
        profile: profile as Profile,
        cycles,
        leads,
        owners,
        groups,
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

  const metrics = useMemo(() => {
    const cycles = state.cycles

    const active = cycles.filter(isOpenCycle)
    const won = cycles.filter(isWonCycle)
    const lost = cycles.filter(isLostCycle)
    const closed = cycles.filter((cycle) => CLOSED_STATUSES.includes(normalizeStatus(cycle.status)))

    const revenue = won.reduce((sum, cycle) => sum + Number(cycle.won_total || 0), 0)

    const closeBase = won.length + lost.length
    const closeRate = closeBase > 0 ? (won.length / closeBase) * 100 : 0
    const generalConversion = cycles.length > 0 ? (won.length / cycles.length) * 100 : 0
    const averageTicket = won.length > 0 ? revenue / won.length : 0

    const pool = cycles.filter((cycle) => !cycle.owner_user_id && isOpenCycle(cycle))

    const now = Date.now()
    const overdue = active.filter((cycle) => {
      const nextActionTime = getTime(cycle.next_action_date)
      return nextActionTime > 0 && nextActionTime < now
    })

    const withoutNextAction = active.filter((cycle) => !cycle.next_action_date)

    const idle = active.filter((cycle) => {
      const enteredAt = getTime(cycle.stage_entered_at)
      if (!enteredAt) return false

      const hours = (now - enteredAt) / 1000 / 60 / 60
      return hours >= 72
    })

    return {
      total: cycles.length,
      active: active.length,
      won: won.length,
      lost: lost.length,
      closed: closed.length,
      revenue,
      closeRate,
      generalConversion,
      averageTicket,
      pool: pool.length,
      overdue: overdue.length,
      withoutNextAction: withoutNextAction.length,
      idle: idle.length,
    }
  }, [state.cycles])

  const funnel = useMemo(() => {
    const map = new Map<string, number>()

    for (const status of STATUS_ORDER) {
      map.set(status, 0)
    }

    for (const cycle of state.cycles) {
      const status = normalizeStatus(cycle.status)
      map.set(status, (map.get(status) || 0) + 1)
    }

    return Array.from(map.entries())
      .filter(([, total]) => total > 0)
      .map(([status, total]) => ({
        status,
        total,
        label: getStatusLabel(status),
        color: STATUS_COLORS[status] || '#64748b',
      }))
  }, [state.cycles])

  const maxFunnel = useMemo(() => {
    return Math.max(...funnel.map((item) => item.total), 1)
  }, [funnel])

  const upcoming = useMemo(() => {
    return state.cycles
      .filter((cycle) => isOpenCycle(cycle) && cycle.next_action_date)
      .sort((a, b) => getTime(a.next_action_date) - getTime(b.next_action_date))
      .slice(0, 8)
  }, [state.cycles])

  const sellerRanking = useMemo(() => {
    const map = new Map<
      string,
      {
        ownerId: string | null
        label: string
        active: number
        won: number
        lost: number
        revenue: number
        total: number
      }
    >()

    for (const cycle of state.cycles) {
      const key = cycle.owner_user_id || 'pool'

      if (!map.has(key)) {
        map.set(key, {
          ownerId: cycle.owner_user_id,
          label: getOwnerLabel(cycle.owner_user_id, state.owners),
          active: 0,
          won: 0,
          lost: 0,
          revenue: 0,
          total: 0,
        })
      }

      const current = map.get(key)!

      current.total += 1

      if (isOpenCycle(cycle)) current.active += 1
      if (isWonCycle(cycle)) {
        current.won += 1
        current.revenue += Number(cycle.won_total || 0)
      }
      if (isLostCycle(cycle)) current.lost += 1
    }

    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 8)
  }, [state.cycles, state.owners])

  const lostReasons = useMemo(() => {
    const map = new Map<string, number>()

    for (const cycle of state.cycles.filter(isLostCycle)) {
      const reason = cycle.lost_reason?.trim() || 'Sem motivo registrado'
      map.set(reason, (map.get(reason) || 0) + 1)
    }

    return Array.from(map.entries())
      .map(([reason, total]) => ({ reason, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6)
  }, [state.cycles])

  const groups = useMemo(() => {
    const map = new Map<string, number>()

    for (const cycle of state.cycles) {
      const groupId = cycle.current_group_id || 'sem_grupo'
      const groupName =
        groupId === 'sem_grupo'
          ? 'Sem grupo'
          : state.groups[groupId]?.name || 'Grupo não identificado'

      map.set(groupName, (map.get(groupName) || 0) + 1)
    }

    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
  }, [state.cycles, state.groups])

  const maxLostReason = Math.max(...lostReasons.map((item) => item.total), 1)
  const maxGroups = Math.max(...groups.map((item) => item.total), 1)

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
                Dashboard real
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
                  maxWidth: 820,
                  lineHeight: 1.55,
                  fontSize: 14,
                }}
              >
                Esta dashboard lê diretamente as tabelas operacionais atuais:
                sales_cycles, leads, profiles e lead_groups. Não usa as views antigas
                do módulo genérico de analytics.
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
                Perfil:{' '}
                <strong style={{ color: '#e2e8f0' }}>
                  {state.profile?.role || 'carregando'}
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
            title="Ciclos ativos"
            value={loading ? '...' : formatNumber(metrics.active)}
            description="Leads que ainda exigem ação comercial."
            accent="#3b82f6"
          />

          <Card
            title="Ganhos"
            value={loading ? '...' : formatNumber(metrics.won)}
            description="Ciclos fechados como ganho no sistema real."
            accent="#22c55e"
          />

          <Card
            title="Receita ganha"
            value={loading ? '...' : formatMoney(metrics.revenue)}
            description="Soma real de won_total nos ciclos ganhos."
            accent="#10b981"
          />

          <Card
            title="Fechamento"
            value={loading ? '...' : formatPercent(metrics.closeRate)}
            description="Ganhos sobre ciclos encerrados como ganho ou perda."
            accent={metrics.closeRate >= 20 ? '#22c55e' : '#f59e0b'}
          />

          <Card
            title="Pool"
            value={loading ? '...' : formatNumber(metrics.pool)}
            description="Ciclos sem responsável, visíveis para administração."
            accent="#a855f7"
          />

          <Card
            title="Atrasados"
            value={loading ? '...' : formatNumber(metrics.overdue)}
            description="Próximas ações vencidas nos ciclos ativos."
            accent="#ef4444"
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
            title="Pipeline real"
            description="Distribuição baseada no campo status da tabela sales_cycles."
          >
            {loading ? (
              <Empty text="Carregando pipeline..." />
            ) : funnel.length === 0 ? (
              <Empty text="Nenhum ciclo encontrado na operação real." />
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
            description="Próximas ações reais registradas nos ciclos ativos."
          >
            {loading ? (
              <Empty text="Carregando próximas ações..." />
            ) : upcoming.length === 0 ? (
              <Empty text="Nenhuma próxima ação encontrada. Se existem ciclos ativos, isso indica falha de follow-up." />
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
                          {getLeadLabel(cycle, state.leads)}
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
            description="Ranking montado a partir dos ciclos reais e seus owner_user_id."
          >
            {loading ? (
              <Empty text="Carregando responsáveis..." />
            ) : sellerRanking.length === 0 ? (
              <Empty text="Nenhum responsável encontrado." />
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
                      <th style={{ padding: '0 0 10px' }}>Ativos</th>
                      <th style={{ padding: '0 0 10px' }}>Ganhos</th>
                      <th style={{ padding: '0 0 10px' }}>Perdidos</th>
                      <th style={{ padding: '0 0 10px' }}>Receita</th>
                    </tr>
                  </thead>

                  <tbody>
                    {sellerRanking.map((seller) => (
                      <tr key={seller.ownerId || 'pool'} style={{ borderTop: '1px solid #1a1d2e' }}>
                        <td style={{ padding: '11px 0', color: '#e2e8f0', fontWeight: 750 }}>
                          {seller.label}
                        </td>
                        <td style={{ padding: '11px 0', color: '#cbd5e1' }}>
                          {formatNumber(seller.active)}
                        </td>
                        <td style={{ padding: '11px 0', color: '#86efac' }}>
                          {formatNumber(seller.won)}
                        </td>
                        <td style={{ padding: '11px 0', color: '#fca5a5' }}>
                          {formatNumber(seller.lost)}
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
            title="Riscos operacionais"
            description="Problemas reais derivados de prazo, agenda e ciclos parados."
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 12,
              }}
            >
              <Card
                title="Sem próxima ação"
                value={loading ? '...' : formatNumber(metrics.withoutNextAction)}
                description="Ciclos ativos sem follow-up marcado."
                accent="#ef4444"
              />

              <Card
                title="Parados 72h+"
                value={loading ? '...' : formatNumber(metrics.idle)}
                description="Ciclos ativos sem mudança recente de etapa."
                accent="#f59e0b"
              />

              <Card
                title="Conversão geral"
                value={loading ? '...' : formatPercent(metrics.generalConversion)}
                description="Ganhos sobre todos os ciclos carregados."
                accent="#8b5cf6"
              />

              <Card
                title="Ticket médio"
                value={loading ? '...' : formatMoney(metrics.averageTicket)}
                description="Receita média por ciclo ganho."
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
            description="Baseado no campo lost_reason dos ciclos perdidos."
          >
            {loading ? (
              <Empty text="Carregando perdas..." />
            ) : lostReasons.length === 0 ? (
              <Empty text="Nenhum motivo de perda encontrado." />
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
            title="Grupos da operação"
            description="Distribuição real por current_group_id conectado a lead_groups."
          >
            {loading ? (
              <Empty text="Carregando grupos..." />
            ) : groups.length === 0 ? (
              <Empty text="Nenhum grupo encontrado." />
            ) : (
              <div style={{ display: 'grid', gap: 14 }}>
                {groups.map((item) => (
                  <Bar
                    key={item.name}
                    label={item.name}
                    value={item.total}
                    max={maxGroups}
                    color="#3b82f6"
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