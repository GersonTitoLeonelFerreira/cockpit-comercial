'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import {
  STAGE_ACTIONS,
  STAGE_LABELS,
  resolveActionId,
  findActionById,
} from '@/app/config/stageActions'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SellerOption {
  id: string
  label: string
}

interface ActionCount {
  actionId: string
  label: string
  category: 'activity' | 'outcome'
  count: number
}

interface StageData {
  stage: string
  label: string
  actions: ActionCount[]
  total: number
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getDateDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTodayDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Event processing
// ---------------------------------------------------------------------------

interface CycleEventRow {
  id: string
  event_type: string
  metadata: Record<string, unknown> | null
  created_by: string | null
  occurred_at: string
}

function extractActionId(event: CycleEventRow): string | null {
  const meta = event.metadata ?? {}

  // Direct action_id in metadata
  if (typeof meta.action_id === 'string' && meta.action_id) {
    return resolveActionId(meta.action_id)
  }

  // Quick action
  if (typeof meta.quick_action === 'string' && meta.quick_action) {
    return resolveActionId(meta.quick_action)
  }

  // stage_changed without action_id — not an action, skip
  if (event.event_type === 'stage_changed') {
    return null
  }

  return null
}

function processEvents(events: CycleEventRow[]): StageData[] {
  // Build count map: stageKey → actionId → count
  const countMap: Record<string, Record<string, number>> = {
    novo: {},
    contato: {},
    respondeu: {},
    negociacao: {},
  }

  for (const event of events) {
    const actionId = extractActionId(event)
    if (!actionId) continue

    const action = findActionById(actionId)
    if (!action) continue

    const stage = action.stage as keyof typeof countMap
    if (!(stage in countMap)) continue

    countMap[stage][actionId] = (countMap[stage][actionId] ?? 0) + 1
  }

  const stageOrder: Array<keyof typeof STAGE_ACTIONS> = ['novo', 'contato', 'respondeu', 'negociacao']

  return stageOrder.map((stageKey) => {
    const taxonomy = STAGE_ACTIONS[stageKey]
    const counts = countMap[stageKey]

    const actions: ActionCount[] = taxonomy.map((a) => ({
      actionId: a.id,
      label: a.label,
      category: a.category,
      count: counts[a.id] ?? 0,
    }))

    // Sort by count descending, stable (preserve taxonomy order on ties)
    actions.sort((a, b) => b.count - a.count)

    const total = actions.reduce((sum, a) => sum + a.count, 0)

    return {
      stage: stageKey,
      label: STAGE_LABELS[stageKey] ?? stageKey,
      actions,
      total,
    }
  })
}

// ---------------------------------------------------------------------------
// SVG Icons
// ---------------------------------------------------------------------------

function IconArrowLeft() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function IconActivity() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  )
}

function IconBarChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}

function IconZap() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  )
}

function IconFilter() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Stage color map
// ---------------------------------------------------------------------------

const STAGE_COLORS: Record<string, { accent: string; bg: string; border: string }> = {
  novo:        { accent: '#60a5fa', bg: '#1e3a5f22', border: '#1e3a5f55' },
  contato:     { accent: '#a78bfa', bg: '#2e1a5f22', border: '#2e1a5f55' },
  respondeu:   { accent: '#34d399', bg: '#0a3b2e22', border: '#0a3b2e55' },
  negociacao:  { accent: '#fbbf24', bg: '#3b2a0a22', border: '#3b2a0a55' },
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode
  label: string
  value: string
  sub?: string
}) {
  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #202020',
        borderRadius: 14,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9aa', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {icon}
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color: 'white', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#666' }}>{sub}</div>}
    </div>
  )
}

function DistributionBar({ stages }: { stages: StageData[] }) {
  const total = stages.reduce((s, st) => s + st.total, 0)
  if (total === 0) return <div style={{ fontSize: 12, color: '#555' }}>Sem dados no período</div>

  const colors = [
    STAGE_COLORS.novo.accent,
    STAGE_COLORS.contato.accent,
    STAGE_COLORS.respondeu.accent,
    STAGE_COLORS.negociacao.accent,
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', height: 8, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
        {stages.map((st, i) => {
          const pct = (st.total / total) * 100
          if (pct === 0) return null
          return (
            <div
              key={st.stage}
              style={{ width: `${pct}%`, background: colors[i], borderRadius: 4, minWidth: 2 }}
            />
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {stages.map((st, i) => {
          const pct = total > 0 ? Math.round((st.total / total) * 100) : 0
          return (
            <span key={st.stage} style={{ fontSize: 11, color: '#888', display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: colors[i] }} />
              {st.label} {pct}%
            </span>
          )
        })}
      </div>
    </div>
  )
}

function ActionRow({
  action,
  stageTotal,
  maxCount,
  stageAccent,
}: {
  action: ActionCount
  stageTotal: number
  maxCount: number
  stageAccent: string
}) {
  const pct = stageTotal > 0 ? Math.round((action.count / stageTotal) * 100) : 0
  const barPct = maxCount > 0 ? (action.count / maxCount) * 100 : 0
  const isZero = action.count === 0

  const categoryBadge =
    action.category === 'activity'
      ? { bg: '#1e3a5f44', color: '#60a5fa', label: 'atividade' }
      : { bg: '#0a3b1a44', color: '#4ade80', label: 'resultado' }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid #1a1a1a',
        opacity: isZero ? 0.45 : 1,
      }}
    >
      {/* Left: label + bar + badge */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: isZero ? '#666' : 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {action.label}
          </span>
          <span
            style={{
              flexShrink: 0,
              fontSize: 10,
              padding: '2px 7px',
              borderRadius: 20,
              background: categoryBadge.bg,
              color: categoryBadge.color,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {categoryBadge.label}
          </span>
        </div>
        {/* Progress bar */}
        <div style={{ height: 4, background: '#1e1e1e', borderRadius: 4, overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${barPct}%`,
              background: isZero ? '#333' : stageAccent,
              borderRadius: 4,
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Count */}
      <div style={{ fontSize: 18, fontWeight: 700, color: isZero ? '#444' : 'white', textAlign: 'right', minWidth: 32 }}>
        {action.count}
      </div>

      {/* Percentage */}
      <div style={{ fontSize: 12, color: '#666', textAlign: 'right', minWidth: 38 }}>
        {isZero ? '—' : `${pct}%`}
      </div>
    </div>
  )
}

function StageSection({ data }: { data: StageData }) {
  const colors = STAGE_COLORS[data.stage] ?? { accent: '#9aa', bg: '#11111122', border: '#22222255' }
  const maxCount = data.actions.length > 0 ? data.actions[0].count : 0

  return (
    <div
      style={{
        background: '#0f0f0f',
        border: `1px solid ${colors.border}`,
        borderRadius: 14,
        padding: '22px 24px',
      }}
    >
      {/* Stage header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              display: 'inline-block',
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: colors.accent,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>{data.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: '#666' }}>Total</span>
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: colors.accent,
              background: colors.bg,
              padding: '3px 10px',
              borderRadius: 20,
              border: `1px solid ${colors.border}`,
            }}
          >
            {data.total}
          </span>
        </div>
      </div>

      {/* Actions list */}
      {data.actions.map((action) => (
        <ActionRow
          key={action.actionId}
          action={action}
          stageTotal={data.total}
          maxCount={maxCount}
          stageAccent={colors.accent}
        />
      ))}

      {data.total === 0 && (
        <div style={{ fontSize: 13, color: '#555', paddingTop: 8 }}>
          Nenhuma ação registrada nesta etapa no período.
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AcoesPorEtapaPage() {
  const supabase = supabaseBrowser()

  // Auth state
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  // Filters
  const [dateStart, setDateStart] = React.useState(getDateDaysAgo(30))
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

  // Data state
  const [stages, setStages] = React.useState<StageData[]>([])
  const [dataLoading, setDataLoading] = React.useState(false)
  const [dataError, setDataError] = React.useState<string | null>(null)

  // Init: load profile + sellers
  React.useEffect(() => {
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const { data: userData } = await supabase.auth.getUser()
        if (!userData.user) throw new Error('Sessão expirada. Faça login novamente.')

        const uid = userData.user.id
        setCurrentUserId(uid)

        const { data: profile } = await supabase
          .from('profiles')
          .select('role, company_id')
          .eq('id', uid)
          .maybeSingle()

        if (!profile?.company_id) throw new Error('Perfil não encontrado.')

        const adminUser = profile.role === 'admin'
        setIsAdmin(adminUser)
        setCompanyId(profile.company_id)

        if (adminUser) {
          const { data: sellersData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .eq('company_id', profile.company_id)
            .eq('role', 'member')
            .order('full_name')

          setSellers(
            (sellersData ?? []).map((s: { id: string; full_name: string | null }) => ({
              id: s.id,
              label: s.full_name ?? s.id,
            }))
          )
          setSelectedSellerId(null)
        } else {
          setSelectedSellerId(uid)
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar perfil.')
      } finally {
        setLoading(false)
      }
    }
    void init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load events and process
  React.useEffect(() => {
    if (!companyId) return

    async function load() {
      setDataLoading(true)
      setDataError(null)
      try {
        let query = supabase
          .from('cycle_events')
          .select('id, event_type, metadata, created_by, occurred_at')
          .eq('company_id', companyId!)
          .gte('occurred_at', dateStart + 'T00:00:00')
          .lte('occurred_at', dateEnd + 'T23:59:59')

        if (selectedSellerId) {
          query = query.eq('created_by', selectedSellerId)
        }

        const { data, error: qErr } = await query.order('occurred_at', { ascending: false })

        if (qErr) throw new Error(qErr.message)

        const processed = processEvents((data ?? []) as CycleEventRow[])
        setStages(processed)
      } catch (e: unknown) {
        setDataError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
      } finally {
        setDataLoading(false)
      }
    }
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, selectedSellerId, dateStart, dateEnd])

  // ============================================================================
  // Derived summary
  // ============================================================================

  const totalActions = stages.reduce((s, st) => s + st.total, 0)

  const mostActiveStage =
    stages.length > 0
      ? stages.reduce((best, st) => (st.total > best.total ? st : best), stages[0])
      : null

  const mostUsedAction = React.useMemo(() => {
    let best: ActionCount | null = null
    for (const st of stages) {
      for (const a of st.actions) {
        if (!best || a.count > best.count) best = a
      }
    }
    return best?.count ? best : null
  }, [stages])

  // ============================================================================
  // Styles
  // ============================================================================

  const navLinkBase: React.CSSProperties = {
    color: '#9aa',
    textDecoration: 'none',
    fontSize: 13,
    padding: '7px 12px',
    borderRadius: 8,
    border: '1px solid #2a2a2a',
    background: 'transparent',
    whiteSpace: 'nowrap',
  }

  const navLinkActive: React.CSSProperties = {
    ...navLinkBase,
    color: 'white',
    background: '#171717',
    borderColor: '#333',
  }

  const navLinkDisabled: React.CSSProperties = {
    ...navLinkBase,
    color: '#555',
    cursor: 'default',
    pointerEvents: 'none',
    borderColor: '#1e1e1e',
  }

  const inputStyle: React.CSSProperties = {
    background: '#111',
    border: '1px solid #2a2a2a',
    borderRadius: 8,
    padding: '8px 12px',
    color: 'white',
    fontSize: 13,
    outline: 'none',
  }

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div style={{ padding: 40, color: '#9aa', fontSize: 14 }}>
        Carregando perfil...
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 40, color: '#ef4444', fontSize: 14 }}>
        {error}
      </div>
    )
  }

  return (
    <div style={{ width: '100%', padding: '32px 40px 80px', color: 'white', maxWidth: 1100, margin: '0 auto' }}>

      {/* Breadcrumb */}
      <div style={{ marginBottom: 24 }}>
        <a
          href="/relatorios"
          style={{ color: '#9aa', textDecoration: 'none', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <IconArrowLeft />
          Voltar para Relatórios
        </a>
      </div>

      {/* Page header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <IconActivity />
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
            Ações por Etapa
          </h1>
        </div>
        <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
          Distribuição das ações operacionais registradas em cada etapa do funil no período.
        </p>
      </div>

      {/* Sub-navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 32, flexWrap: 'wrap' }}>
        <a href="/relatorios/operacao/acoes-por-etapa" style={navLinkActive}>
          Ações por Etapa
        </a>
        <span style={navLinkDisabled}>Avanço por Ação</span>
        <span style={navLinkDisabled}>Objeções e Perdas</span>
        <span style={navLinkDisabled}>Próximas Ações</span>
        <span style={navLinkDisabled}>Canais</span>
        <span style={navLinkDisabled}>Desempenho por Consultor</span>
      </div>

      {/* Filter bar */}
      <div
        style={{
          background: '#0f0f0f',
          border: '1px solid #202020',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 28,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#9aa', fontSize: 12 }}>
          <IconFilter />
          Filtros
        </div>

        {/* Date start */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            De
          </label>
          <input
            type="date"
            value={dateStart}
            onChange={(e) => setDateStart(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Date end */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Até
          </label>
          <input
            type="date"
            value={dateEnd}
            onChange={(e) => setDateEnd(e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* Consultant filter — admin only */}
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 11, color: '#666', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Consultor
            </label>
            <select
              value={selectedSellerId ?? ''}
              onChange={(e) => setSelectedSellerId(e.target.value || null)}
              style={{ ...inputStyle, minWidth: 180 }}
            >
              <option value="">Todos os consultores</option>
              {sellers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Loading indicator */}
        {dataLoading && (
          <div style={{ fontSize: 12, color: '#666', marginLeft: 'auto', alignSelf: 'center' }}>
            Carregando...
          </div>
        )}
      </div>

      {/* Data error */}
      {dataError && (
        <div style={{ padding: '14px 18px', background: '#1a0a0a', border: '1px solid #3b1010', borderRadius: 10, color: '#ef4444', fontSize: 13, marginBottom: 24 }}>
          Erro ao carregar dados: {dataError}
        </div>
      )}

      {/* Summary cards */}
      {!dataLoading && !dataError && (
        <>
          <div style={{ display: 'flex', gap: 14, marginBottom: 28, flexWrap: 'wrap' }}>
            <SummaryCard
              icon={<IconBarChart />}
              label="Total de ações"
              value={totalActions.toString()}
              sub={`No período: ${dateStart} → ${dateEnd}`}
            />
            <SummaryCard
              icon={<IconLayers />}
              label="Etapa mais ativa"
              value={mostActiveStage && mostActiveStage.total > 0 ? mostActiveStage.label : '—'}
              sub={mostActiveStage && mostActiveStage.total > 0 ? `${mostActiveStage.total} ações registradas` : 'Sem dados no período'}
            />
            <SummaryCard
              icon={<IconZap />}
              label="Ação mais usada"
              value={mostUsedAction ? mostUsedAction.label : '—'}
              sub={mostUsedAction ? `${mostUsedAction.count} ocorrências` : 'Sem dados no período'}
            />
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #202020',
                borderRadius: 14,
                padding: '20px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                flex: 1,
                minWidth: 220,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#9aa', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <IconActivity />
                Distribuição
              </div>
              <DistributionBar stages={stages} />
            </div>
          </div>

          {/* Stage breakdowns */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {stages.map((stage) => (
              <StageSection key={stage.stage} data={stage} />
            ))}
          </div>
        </>
      )}

      {/* Non-admin info */}
      {!isAdmin && currentUserId && (
        <div style={{ marginTop: 24, fontSize: 12, color: '#555' }}>
          Exibindo apenas suas ações registradas.
        </div>
      )}
    </div>
  )
}
