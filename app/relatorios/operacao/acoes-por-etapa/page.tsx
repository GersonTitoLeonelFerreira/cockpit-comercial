'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import {
  STAGE_ACTIONS,
  STAGE_LABELS,
  resolveActionId,
  findActionById,
} from '@/app/config/stageActions'

// ==============================================================================
// Helpers
// ==============================================================================

function getThirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getTodayDate(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

// ==============================================================================
// Types
// ==============================================================================

interface SellerOption {
  id: string
  full_name: string | null
}

interface ActionRow {
  actionId: string
  label: string
  stage: string
  category: 'activity' | 'outcome'
  count: number
}

interface StageBreakdown {
  stage: string
  label: string
  color: string
  actions: ActionRow[]
  total: number
}

// ==============================================================================
// Constants
// ==============================================================================

const STAGE_ORDER = ['novo', 'contato', 'respondeu', 'negociacao'] as const

const STAGE_COLORS: Record<string, string> = {
  novo: '#60a5fa',
  contato: '#a78bfa',
  respondeu: '#34d399',
  negociacao: '#fbbf24',
}

// ==============================================================================
// SVG Icons
// ==============================================================================

function IconLayers() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconChevronLeft() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconLoader() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="#333" strokeWidth="2" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#888" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

// ==============================================================================
// Sub-components
// ==============================================================================

function SummaryCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: string
}) {
  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #202020',
        borderRadius: 12,
        padding: '18px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        flex: '1 1 180px',
        minWidth: 0,
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' }}>
        {label}
      </span>
      <span style={{ fontSize: 24, fontWeight: 700, color: accent ?? 'white', lineHeight: 1.1 }}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 12, color: '#555', lineHeight: 1.4 }}>{sub}</span>
      )}
    </div>
  )
}

function CategoryBadge({ category }: { category: 'activity' | 'outcome' }) {
  const isActivity = category === 'activity'
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: isActivity ? '#60a5fa' : '#a78bfa',
        background: isActivity ? '#60a5fa14' : '#a78bfa14',
        border: `1px solid ${isActivity ? '#60a5fa33' : '#a78bfa33'}`,
        borderRadius: 4,
        padding: '2px 6px',
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      {isActivity ? 'atividade' : 'resultado'}
    </span>
  )
}

function ActionRowItem({
  row,
  stageTotal,
  stageColor,
}: {
  row: ActionRow
  stageTotal: number
  stageColor: string
}) {
  const pct = stageTotal > 0 ? Math.round((row.count / stageTotal) * 100) : 0
  const isZero = row.count === 0

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid #181818',
        opacity: isZero ? 0.35 : 1,
      }}
    >
      {/* Label + badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 0', minWidth: 0 }}>
        <span style={{ fontSize: 13, color: isZero ? '#666' : 'white', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {row.label}
        </span>
        <CategoryBadge category={row.category} />
      </div>
      {/* Count */}
      <span style={{ fontSize: 13, fontWeight: 700, color: isZero ? '#555' : 'white', minWidth: 28, textAlign: 'right', flexShrink: 0 }}>
        {row.count}
      </span>
      {/* Pct */}
      <span style={{ fontSize: 11, color: '#555', minWidth: 36, textAlign: 'right', flexShrink: 0 }}>
        {pct}%
      </span>
      {/* Progress bar */}
      <div
        style={{
          width: 80,
          height: 4,
          background: '#1e1e1e',
          borderRadius: 2,
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: stageColor,
            borderRadius: 2,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
    </div>
  )
}

function StageSection({ breakdown }: { breakdown: StageBreakdown }) {
  const sorted = [...breakdown.actions].sort((a, b) => b.count - a.count)

  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #1e1e1e',
        borderRadius: 14,
        padding: '20px 24px',
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 4,
          paddingBottom: 14,
          borderBottom: '1px solid #1a1a1a',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: breakdown.color,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color: breakdown.color }}>
            {breakdown.label}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
          {breakdown.total} <span style={{ fontSize: 11, fontWeight: 400, color: '#555' }}>ações</span>
        </span>
      </div>

      {/* Action rows */}
      <div>
        {sorted.map((row) => (
          <ActionRowItem
            key={row.actionId}
            row={row}
            stageTotal={breakdown.total}
            stageColor={breakdown.color}
          />
        ))}
      </div>
    </div>
  )
}

function DistributionBar({ breakdowns }: { breakdowns: StageBreakdown[] }) {
  const grandTotal = breakdowns.reduce((s, b) => s + b.total, 0)
  if (grandTotal === 0) {
    return (
      <div style={{ height: 8, background: '#1e1e1e', borderRadius: 4, marginTop: 6 }} />
    )
  }

  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 8, gap: 1 }}>
      {breakdowns.map((b) => {
        const pct = Math.round((b.total / grandTotal) * 100)
        if (pct === 0) return null
        return (
          <div
            key={b.stage}
            title={`${b.label}: ${pct}%`}
            style={{ width: `${pct}%`, height: '100%', background: b.color }}
          />
        )
      })}
    </div>
  )
}

// ==============================================================================
// Main Page
// ==============================================================================

export default function AcoesPorEtapaPage() {
  const supabase = supabaseBrowser()

  // Auth/profile
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [isAdmin, setIsAdmin] = React.useState(false)
  const [companyId, setCompanyId] = React.useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = React.useState<string | null>(null)
  const [sellers, setSellers] = React.useState<SellerOption[]>([])

  // Filters
  const [dateStart, setDateStart] = React.useState(getThirtyDaysAgo())
  const [dateEnd, setDateEnd] = React.useState(getTodayDate())
  const [selectedSellerId, setSelectedSellerId] = React.useState<string | null>(null)

  // Data
  const [breakdowns, setBreakdowns] = React.useState<StageBreakdown[]>([])
  const [dataLoading, setDataLoading] = React.useState(false)

  // ===========================================================================
  // Init — auth + profile
  // ===========================================================================
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

          setSellers((sellersData ?? []) as SellerOption[])
        }
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Erro ao carregar.')
      } finally {
        setLoading(false)
      }
    }
    init()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ===========================================================================
  // Load data
  // ===========================================================================
  React.useEffect(() => {
    if (!companyId) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateStart, dateEnd, selectedSellerId, isAdmin, currentUserId])

  async function loadData() {
    if (!companyId) return
    setDataLoading(true)
    try {
      let query = supabase
        .from('cycle_events')
        .select('id, event_type, metadata, created_by, occurred_at')
        .eq('company_id', companyId)
        .gte('occurred_at', `${dateStart}T00:00:00`)
        .lte('occurred_at', `${dateEnd}T23:59:59`)

      if (isAdmin && selectedSellerId) {
        query = query.eq('created_by', selectedSellerId)
      } else if (!isAdmin && currentUserId) {
        query = query.eq('created_by', currentUserId)
      }

      const { data, error: fetchError } = await query

      if (fetchError) throw fetchError

      // Build count map: resolvedActionId -> count
      const countMap: Record<string, number> = {}

      for (const event of data ?? []) {
        const meta = (event.metadata ?? {}) as Record<string, unknown>

        // Extract raw action id from metadata
        const rawId = (meta.action_id ?? meta.quick_action ?? null) as string | null

        // Skip stage_changed events that have no action attached
        if (event.event_type === 'stage_changed' && !rawId) continue

        // Skip events with no action id entirely
        if (!rawId) continue

        const resolvedId = resolveActionId(rawId)
        const actionDef = findActionById(resolvedId)

        // Only count actions that belong to our taxonomy
        if (!actionDef) continue

        countMap[resolvedId] = (countMap[resolvedId] ?? 0) + 1
      }

      // Build breakdowns from taxonomy
      const result: StageBreakdown[] = STAGE_ORDER.map((stage) => {
        const actionDefs = STAGE_ACTIONS[stage]
        const actions: ActionRow[] = actionDefs.map((def) => ({
          actionId: def.id,
          label: def.label,
          stage: def.stage,
          category: def.category,
          count: countMap[def.id] ?? 0,
        }))
        const total = actions.reduce((s, a) => s + a.count, 0)
        return {
          stage,
          label: STAGE_LABELS[stage] ?? stage,
          color: STAGE_COLORS[stage] ?? '#888',
          actions,
          total,
        }
      })

      setBreakdowns(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
    } finally {
      setDataLoading(false)
    }
  }

  // ===========================================================================
  // Derived summary values
  // ===========================================================================
  const grandTotal = breakdowns.reduce((s, b) => s + b.total, 0)

  const mostActiveStage = breakdowns.length > 0
    ? breakdowns.reduce((best, b) => (b.total > best.total ? b : best), breakdowns[0])
    : null

  const allActionRows = breakdowns.flatMap((b) => b.actions)
  const mostUsedAction = allActionRows.length > 0
    ? allActionRows.reduce((best, a) => (a.count > best.count ? a : best), allActionRows[0])
    : null

  // ===========================================================================
  // Loading / Error states
  // ===========================================================================
  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0c0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#666', fontSize: 14 }}>
          <IconLoader />
          Carregando...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0c0c0c', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: '#0f0f0f', border: '1px solid #333', borderRadius: 12, padding: '24px 32px', maxWidth: 420, textAlign: 'center' }}>
          <p style={{ color: '#ef4444', fontSize: 14, margin: 0 }}>{error}</p>
          <a href="/login" style={{ display: 'inline-block', marginTop: 16, fontSize: 13, color: '#60a5fa', textDecoration: 'none' }}>
            Ir para o login
          </a>
        </div>
      </div>
    )
  }

  // ===========================================================================
  // Render
  // ===========================================================================
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#0c0c0c',
        color: 'white',
        padding: '40px 24px 80px',
        overflowY: 'auto',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>

        {/* Breadcrumb */}
        <div style={{ marginBottom: 28 }}>
          <a
            href="/relatorios"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 13,
              color: '#555',
              textDecoration: 'none',
            }}
            onMouseOver={(e) => (e.currentTarget.style.color = '#aaa')}
            onMouseOut={(e) => (e.currentTarget.style.color = '#555')}
          >
            <IconChevronLeft />
            Voltar para Relatórios
          </a>
        </div>

        {/* Page header */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ color: '#a78bfa' }}><IconLayers /></span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Ações por Etapa
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Distribuição das ações operacionais registradas em cada etapa do funil
          </p>
        </div>

        {/* Sub-navigation */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            flexWrap: 'wrap',
            marginBottom: 32,
            borderBottom: '1px solid #1a1a1a',
            paddingBottom: 0,
          }}
        >
          {[
            { label: 'Ações por Etapa', active: true },
            { label: 'Avanço por Ação', active: false },
            { label: 'Objeções e Perdas', active: false },
            { label: 'Próximas Ações', active: false },
            { label: 'Canais', active: false },
            { label: 'Desempenho por Consultor', active: false },
          ].map((tab) => (
            <button
              key={tab.label}
              disabled={!tab.active}
              style={{
                background: 'none',
                border: 'none',
                borderBottom: tab.active ? '2px solid #a78bfa' : '2px solid transparent',
                cursor: tab.active ? 'default' : 'not-allowed',
                padding: '8px 14px',
                fontSize: 13,
                fontWeight: tab.active ? 600 : 400,
                color: tab.active ? '#a78bfa' : '#444',
                marginBottom: -1,
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
              {!tab.active && (
                <span
                  style={{
                    marginLeft: 6,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: '#333',
                    background: '#151515',
                    border: '1px solid #222',
                    borderRadius: 3,
                    padding: '1px 5px',
                  }}
                >
                  em breve
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 32,
            padding: '16px 20px',
            background: '#0f0f0f',
            border: '1px solid #1e1e1e',
            borderRadius: 12,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
              De
            </label>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              style={{
                background: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                fontSize: 13,
                padding: '6px 10px',
                outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
              Até
            </label>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              style={{
                background: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                fontSize: 13,
                padding: '6px 10px',
                outline: 'none',
                colorScheme: 'dark',
              }}
            />
          </div>

          {isAdmin && sellers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
                Consultor
              </label>
              <select
                value={selectedSellerId ?? ''}
                onChange={(e) => setSelectedSellerId(e.target.value || null)}
                style={{
                  background: '#151515',
                  border: '1px solid #2a2a2a',
                  borderRadius: 8,
                  color: 'white',
                  fontSize: 13,
                  padding: '6px 10px',
                  outline: 'none',
                  minWidth: 180,
                }}
              >
                <option value="">Todos os consultores</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? s.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          {dataLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555', fontSize: 12 }}>
              <IconLoader />
              Atualizando...
            </div>
          )}
        </div>

        {/* Executive Summary — 4 cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
          <SummaryCard
            label="Total de ações"
            value={grandTotal}
            sub="no período selecionado"
          />
          <SummaryCard
            label="Etapa mais ativa"
            value={mostActiveStage && mostActiveStage.total > 0 ? mostActiveStage.label : '—'}
            sub={mostActiveStage && mostActiveStage.total > 0 ? `${mostActiveStage.total} ações` : 'sem dados'}
            accent={mostActiveStage && mostActiveStage.total > 0 ? mostActiveStage.color : undefined}
          />
          <SummaryCard
            label="Ação mais usada"
            value={mostUsedAction && mostUsedAction.count > 0 ? mostUsedAction.label : '—'}
            sub={mostUsedAction && mostUsedAction.count > 0 ? `${mostUsedAction.count}× registrada` : 'sem dados'}
          />
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #202020',
              borderRadius: 12,
              padding: '18px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              flex: '1 1 180px',
              minWidth: 0,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' }}>
              Distribuição por etapa
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
              {breakdowns.map((b) => (
                <div key={b.stage} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: b.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: '#666', minWidth: 70 }}>{b.label}</span>
                  <span style={{ fontSize: 11, color: '#888', fontWeight: 600 }}>
                    {grandTotal > 0 ? Math.round((b.total / grandTotal) * 100) : 0}%
                  </span>
                </div>
              ))}
            </div>
            <DistributionBar breakdowns={breakdowns} />
          </div>
        </div>

        {/* Stage breakdowns */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {breakdowns.map((breakdown) => (
            <StageSection key={breakdown.stage} breakdown={breakdown} />
          ))}
        </div>

      </div>
    </div>
  )
}
