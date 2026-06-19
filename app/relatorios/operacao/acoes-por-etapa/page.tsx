'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { fetchAllCycleEvents } from '@/app/lib/supabasePaginatedFetch'
import {
  STAGE_ACTIONS,
  STAGE_LABELS,
  extractActionFromEvent,
} from '@/app/config/stageActions'
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

type ActionRow = {
  actionId: string
  label: string
  stage: string
  category: 'activity' | 'outcome'
  count: number
}

type StageBreakdown = {
  stage: string
  label: string
  color: string
  actions: ActionRow[]
  total: number
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
  { label: 'Ações por Etapa', href: null },
  { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
  { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
  { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
  { label: 'Canais', href: '/relatorios/operacao/canais' },
  { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor' },
]

function getThirtyDaysAgo() {
  const date = new Date()
  date.setDate(date.getDate() - 30)
  return date.toISOString().slice(0, 10)
}

function getTodayDate() {
  return new Date().toISOString().slice(0, 10)
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

function cardStyle(): React.CSSProperties {
  return {
    background: '#141722',
    border: '1px solid #1a1d2e',
    borderRadius: 9,
  }
}

function getActionLabel(actionId: string) {
  for (const stage of STAGE_ORDER) {
    const found = STAGE_ACTIONS[stage].find((item) => item.id === actionId)
    if (found) return found.label
  }

  return actionId.replace(/_/g, ' ')
}

function getActionStage(actionId: string) {
  for (const stage of STAGE_ORDER) {
    const found = STAGE_ACTIONS[stage].find((item) => item.id === actionId)
    if (found) return found.stage
  }

  return 'novo'
}

function getActionCategory(actionId: string): 'activity' | 'outcome' {
  for (const stage of STAGE_ORDER) {
    const found = STAGE_ACTIONS[stage].find((item) => item.id === actionId)
    if (found) return found.category
  }

  return 'activity'
}

function buildBreakdowns(events: RawEvent[]) {
  const countMap = new Map<string, number>()

  for (const event of events) {
    const actionId = extractActionFromEvent(event)

    if (!actionId) continue

    countMap.set(actionId, (countMap.get(actionId) ?? 0) + 1)
  }

  return STAGE_ORDER.map((stage) => {
    const knownActions = STAGE_ACTIONS[stage].map((action) => ({
      actionId: action.id,
      label: action.label,
      stage: action.stage,
      category: action.category,
      count: countMap.get(action.id) ?? 0,
    }))

    const knownIds = new Set(knownActions.map((action) => action.actionId))

    const unknownActions: ActionRow[] = Array.from(countMap.entries())
      .filter(([actionId]) => !knownIds.has(actionId) && getActionStage(actionId) === stage)
      .map(([actionId, count]) => ({
        actionId,
        label: getActionLabel(actionId),
        stage,
        category: getActionCategory(actionId),
        count,
      }))

    const actions = [...knownActions, ...unknownActions]
    const total = actions.reduce((sum, action) => sum + action.count, 0)

    return {
      stage,
      label: STAGE_LABELS[stage] ?? stage,
      color: STAGE_COLORS[stage],
      actions,
      total,
    } satisfies StageBreakdown
  })
}

function SummaryCard({
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
      <div style={{ color: '#4a5569', fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ color: accent, fontSize: 26, fontWeight: 900, lineHeight: 1.1, marginTop: 10 }}>
        {value}
      </div>
      <div style={{ color: '#8fa3bc', fontSize: 11, lineHeight: 1.45, marginTop: 8 }}>
        {detail}
      </div>
    </div>
  )
}

function StageSection({ breakdown }: { breakdown: StageBreakdown }) {
  const sortedActions = [...breakdown.actions].sort((a, b) => b.count - a.count)
  const visibleActions = sortedActions.filter((action) => action.count > 0)

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
          <span style={{ background: breakdown.color, borderRadius: 999, height: 9, width: 9 }} />
          <span style={{ color: breakdown.color, fontSize: 14, fontWeight: 900 }}>
            {breakdown.label}
          </span>
        </div>
        <span style={{ color: '#edf2f7', fontSize: 14, fontWeight: 800 }}>
          {breakdown.total}
          <span style={{ color: '#546070', fontSize: 11, fontWeight: 500 }}> ações</span>
        </span>
      </div>

      {visibleActions.length === 0 ? (
        <div style={{ color: '#546070', fontSize: 12, padding: '18px 0 4px' }}>
          Nenhuma ação registrada nesta etapa no período.
        </div>
      ) : (
        <div>
          {visibleActions.map((action) => {
            const percentage = breakdown.total > 0 ? (action.count / breakdown.total) * 100 : 0
            const isOutcome = action.category === 'outcome'

            return (
              <div
                key={action.actionId}
                style={{
                  alignItems: 'center',
                  borderBottom: '1px solid #13162a',
                  display: 'grid',
                  gap: 12,
                  gridTemplateColumns: 'minmax(0, 1fr) 42px 46px 90px',
                  padding: '11px 0',
                }}
              >
                <div style={{ alignItems: 'center', display: 'flex', gap: 8, minWidth: 0 }}>
                  <span
                    style={{
                      background: isOutcome ? '#a78bfa14' : '#60a5fa14',
                      border: `1px solid ${isOutcome ? '#a78bfa33' : '#60a5fa33'}`,
                      borderRadius: 4,
                      color: isOutcome ? '#a78bfa' : '#60a5fa',
                      flexShrink: 0,
                      fontSize: 9,
                      fontWeight: 800,
                      letterSpacing: '0.06em',
                      padding: '3px 6px',
                      textTransform: 'uppercase',
                    }}
                  >
                    {isOutcome ? 'resultado' : 'atividade'}
                  </span>
                  <span style={{ color: '#edf2f7', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {action.label}
                  </span>
                </div>
                <span style={{ color: '#edf2f7', fontSize: 13, fontWeight: 800, textAlign: 'right' }}>
                  {action.count}
                </span>
                <span style={{ color: '#8fa3bc', fontSize: 11, textAlign: 'right' }}>
                  {formatPercent(percentage)}
                </span>
                <div style={{ background: '#1a1d2e', borderRadius: 999, height: 5, overflow: 'hidden' }}>
                  <div style={{ background: breakdown.color, borderRadius: 999, height: '100%', width: `${percentage}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default function AcoesPorEtapaPage() {
  const supabase = React.useMemo(() => supabaseBrowser(), [])

  const [loading, setLoading] = React.useState(true)
  const [loadingData, setLoadingData] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])
  const [breakdowns, setBreakdowns] = React.useState<StageBreakdown[]>([])

  const [dateStart, setDateStart] = React.useState(getThirtyDaysAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

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
          ['admin', 'owner', 'manager'].includes(role) ||
          activeSellers.some((seller) => seller.id !== me.user_id)

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

    async function loadData() {
      setLoadingData(true)
      setError(null)

      try {
        const events = await fetchAllCycleEvents(supabase, {
          companyId: resolvedCompanyId,
          dateStart,
          dateEnd,
          sellerId: isAdmin ? selectedSellerId : resolvedCurrentUserId,
          columns: 'id, cycle_id, event_type, metadata, created_by, occurred_at',
        })

        setBreakdowns(buildBreakdowns(events as RawEvent[]))
      } catch (cause: unknown) {
        setError(cause instanceof Error ? cause.message : 'Erro ao carregar dados.')
      } finally {
        setLoadingData(false)
      }
    }

    void loadData()
  }, [companyId, currentUserId, dateStart, dateEnd, selectedSellerId, isAdmin, supabase])

  const totalActions = breakdowns.reduce((sum, breakdown) => sum + breakdown.total, 0)
  const mostActiveStage =
    breakdowns.length > 0
      ? [...breakdowns].sort((a, b) => b.total - a.total)[0]
      : null

  const mostUsedAction =
    breakdowns
      .flatMap((breakdown) => breakdown.actions)
      .sort((a, b) => b.count - a.count)[0] ?? null

  if (loading) {
    return (
      <div style={{ alignItems: 'center', background: '#090b0f', color: '#8fa3bc', display: 'flex', justifyContent: 'center', minHeight: '100vh' }}>
        Carregando Ações por Etapa...
      </div>
    )
  }

  if (error && breakdowns.length === 0) {
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
      <div style={{ margin: '0 auto', maxWidth: 1200 }}>
        <a href="/relatorios" style={{ color: '#8fa3bc', display: 'inline-flex', fontSize: 13, marginBottom: 28, textDecoration: 'none' }}>
          ← Voltar para Relatórios
        </a>

        <header style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, margin: 0 }}>Ações por Etapa</h1>
          <p style={{ color: '#8fa3bc', fontSize: 13, margin: '7px 0 0' }}>
            Distribuição das ações comerciais registradas em cada etapa do funil.
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

          {loadingData && <span style={{ color: '#8fa3bc', fontSize: 12, paddingBottom: 8 }}>Atualizando...</span>}
        </section>

        {error && (
          <div style={{ background: '#ef444414', border: '1px solid #ef444440', borderRadius: 7, color: '#fca5a5', fontSize: 13, marginBottom: 20, padding: '10px 14px' }}>
            {error}
          </div>
        )}

        <section style={{ marginBottom: 28 }}>
          <div style={{ color: '#93c5fd', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', marginBottom: 12, textTransform: 'uppercase' }}>
            Panorama do período
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
            <SummaryCard label="Total de ações" value={totalActions} detail="ações com identificação na taxonomia do funil" accent="#60a5fa" />
            <SummaryCard
              label="Etapa mais ativa"
              value={mostActiveStage?.total ? mostActiveStage.label : '—'}
              detail={mostActiveStage?.total ? `${mostActiveStage.total} ações registradas` : 'sem ações no período'}
              accent={mostActiveStage?.color}
            />
            <SummaryCard
              label="Ação mais usada"
              value={mostUsedAction?.count ? mostUsedAction.label : '—'}
              detail={mostUsedAction?.count ? `${mostUsedAction.count} registro(s)` : 'sem ações no período'}
              accent="#a78bfa"
            />
            <SummaryCard
              label="Etapas ativas"
              value={breakdowns.filter((breakdown) => breakdown.total > 0).length}
              detail="etapas com ao menos uma ação registrada"
              accent="#86efac"
            />
          </div>
        </section>

        {totalActions === 0 && !loadingData ? (
          <section style={{ ...cardStyle(), color: '#8fa3bc', padding: '48px 24px', textAlign: 'center' }}>
            <strong style={{ color: '#edf2f7' }}>Nenhuma ação identificada no período.</strong>
            <div style={{ fontSize: 12, marginTop: 7 }}>
              Ajuste o período ou o consultor selecionado.
            </div>
          </section>
        ) : (
          <section style={{ display: 'grid', gap: 16 }}>
            {breakdowns.map((breakdown) => (
              <StageSection key={breakdown.stage} breakdown={breakdown} />
            ))}
          </section>
        )}
      </div>
    </div>
  )
}

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
