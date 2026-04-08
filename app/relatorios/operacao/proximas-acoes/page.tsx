'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { fetchAllCycleEvents } from '@/app/lib/supabasePaginatedFetch'
import { STAGE_LABELS, resolveCheckpointData } from '@/app/config/stageActions'

// ============================================================================
// Helpers
// ============================================================================

function getThirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().slice(0, 10)
}

function getTodayDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function safePct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0
}

// ============================================================================
// Types
// ============================================================================

interface SellerOption {
  id: string
  full_name: string | null
}

interface RawEvent {
  id: string
  cycle_id: string | null
  event_type: string
  metadata: Record<string, unknown> | null
  occurred_at: string
  created_by: string | null
}

interface NextActionStat {
  label: string        // display text (first occurrence, original casing)
  total: number
  byStage: Record<string, number>
  withDate: number
  withoutDate: number
}

interface ReportData {
  actions: NextActionStat[]
  totalEvents: number
  totalWithDate: number
  totalWithoutDate: number
}

// ============================================================================
// Constants
// ============================================================================

const STAGE_ORDER = ['novo', 'contato', 'respondeu', 'negociacao'] as const

const STAGE_COLORS: Record<string, string> = {
  novo: '#60a5fa',
  contato: '#a78bfa',
  respondeu: '#34d399',
  negociacao: '#fbbf24',
}

const ACCENT = '#fde68a'
const DOT_COLOR = '#f59e0b'

// ============================================================================
// Core analytics
// ============================================================================

function buildReportData(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string | null,
  stageFilter: string,
): ReportData {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  // normalized key → stat accumulator
  const actionMap = new Map<string, {
    label: string
    total: number
    byStage: Record<string, number>
    withDate: number
    withoutDate: number
  }>()

  for (const ev of events) {
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue

    // Seller filter (in-memory)
    if (isAdmin && selectedSellerId) {
      if (ev.created_by !== selectedSellerId) continue
    } else if (!isAdmin && currentUserId) {
      if (ev.created_by !== currentUserId) continue
    }

    const meta = (ev.metadata ?? {}) as Record<string, unknown>
    const cp = resolveCheckpointData(meta)

    // Extract next_action text — prefer event-level, fallback to checkpoint
    const rawAction = String(
      meta.next_action ?? cp.next_action ?? ''
    ).trim()

    if (!rawAction) continue

    // Extract next_action_date
    const rawDate = String(
      meta.next_action_date ?? cp.next_action_date ?? ''
    ).trim()

    // Determine stage
    const stage = String(
      meta.to_status ?? meta.from_status ?? meta.from_stage ?? meta.stage ?? ''
    ).toLowerCase() || 'desconhecida'

    // Apply stage filter BEFORE counting
    if (stageFilter && stage !== stageFilter) continue

    // Normalize for grouping: trim + lowercase only (no aggressive fusion)
    const key = rawAction.toLowerCase()

    const existing = actionMap.get(key)
    if (existing) {
      existing.total++
      existing.byStage[stage] = (existing.byStage[stage] ?? 0) + 1
      if (rawDate) existing.withDate++
      else existing.withoutDate++
    } else {
      actionMap.set(key, {
        label: rawAction,  // preserve original casing from first occurrence
        total: 1,
        byStage: { [stage]: 1 },
        withDate: rawDate ? 1 : 0,
        withoutDate: rawDate ? 0 : 1,
      })
    }
  }

  const actions: NextActionStat[] = []
  for (const [, val] of actionMap.entries()) {
    actions.push({
      label: val.label,
      total: val.total,
      byStage: val.byStage,
      withDate: val.withDate,
      withoutDate: val.withoutDate,
    })
  }
  actions.sort((a, b) => b.total - a.total)

  const totalEvents = actions.reduce((s, a) => s + a.total, 0)
  const totalWithDate = actions.reduce((s, a) => s + a.withDate, 0)
  const totalWithoutDate = actions.reduce((s, a) => s + a.withoutDate, 0)

  return { actions, totalEvents, totalWithDate, totalWithoutDate }
}

// ============================================================================
// SVG Icons
// ============================================================================

function IconListCheck() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCalendar() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconHash() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

// ============================================================================
// Sub-components
// ============================================================================

function SummaryCard({
  label,
  value,
  sub,
  accent,
  icon,
}: {
  label: string
  value: React.ReactNode
  sub?: string
  accent?: string
  icon?: React.ReactNode
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#555' }}>
          {label}
        </span>
        {icon && <span style={{ color: accent ?? '#444' }}>{icon}</span>}
      </div>
      <span
        style={{
          fontSize: 18,
          fontWeight: 700,
          color: accent ?? 'white',
          lineHeight: 1.2,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
      {sub && <span style={{ fontSize: 12, color: '#555', lineHeight: 1.4 }}>{sub}</span>}
    </div>
  )
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const fill = max > 0 ? (value / max) * 100 : 0
  return (
    <div
      style={{
        flex: '1 1 0',
        height: 4,
        background: '#1e1e1e',
        borderRadius: 2,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${fill}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

function StageDots({ byStage }: { byStage: Record<string, number> }) {
  const entries = STAGE_ORDER.filter(s => byStage[s] > 0)
  if (entries.length === 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      {entries.map((stage) => (
        <div
          key={stage}
          title={`${STAGE_LABELS[stage] ?? stage}: ${byStage[stage]}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: STAGE_COLORS[stage] ?? '#555',
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 10, color: '#555' }}>{byStage[stage]}</span>
        </div>
      ))}
    </div>
  )
}

function ActionRow({ stat, maxTotal }: { stat: NextActionStat; maxTotal: number }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderBottom: '1px solid #181818',
      }}
    >
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'white',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stat.label}
        </span>
      </div>
      <StageDots byStage={stat.byStage} />
      <ProgressBar value={stat.total} max={maxTotal} color={DOT_COLOR} />
      <span
        style={{
          fontSize: 12,
          color: '#555',
          flexShrink: 0,
          minWidth: 28,
          textAlign: 'right',
        }}
      >
        {stat.withDate}
      </span>
      <span
        style={{
          fontSize: 12,
          color: '#555',
          flexShrink: 0,
          minWidth: 28,
          textAlign: 'right',
        }}
      >
        {stat.withoutDate}
      </span>
      <span
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: ACCENT,
          flexShrink: 0,
          minWidth: 24,
          textAlign: 'right',
        }}
      >
        {stat.total}
      </span>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      style={{
        padding: '28px 20px',
        textAlign: 'center',
      }}
    >
      <p style={{ color: '#555', fontSize: 13, margin: 0 }}>Nenhuma próxima ação registrada no período.</p>
      <p style={{ color: '#444', fontSize: 12, margin: '6px 0 0' }}>
        Tente ampliar o intervalo de datas ou remover filtros.
      </p>
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function ProximasAcoesPage() {
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
  const [selectedStage, setSelectedStage] = React.useState('')

  // Data
  const [reportData, setReportData] = React.useState<ReportData>({
    actions: [],
    totalEvents: 0,
    totalWithDate: 0,
    totalWithoutDate: 0,
  })
  const [dataLoading, setDataLoading] = React.useState(false)

  // ==========================================================================
  // Init — auth + profile
  // ==========================================================================
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

  // ==========================================================================
  // Load data
  // ==========================================================================
  React.useEffect(() => {
    if (!companyId) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateStart, dateEnd, selectedSellerId, selectedStage, isAdmin, currentUserId])

  async function loadData() {
    if (!companyId) return
    setDataLoading(true)
    try {
      const data = await fetchAllCycleEvents(supabase, {
        companyId,
        dateStart,
        dateEnd,
        columns: 'id, cycle_id, event_type, metadata, occurred_at, created_by',
      })

      const result = buildReportData(
        (data ?? []) as RawEvent[],
        dateStart,
        dateEnd,
        selectedSellerId,
        isAdmin,
        currentUserId,
        selectedStage,
      )
      setReportData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
    } finally {
      setDataLoading(false)
    }
  }

  // ==========================================================================
  // Derived values
  // ==========================================================================

  const { actions, totalEvents, totalWithDate, totalWithoutDate } = reportData

  const topAction = actions.length > 0 ? actions[0] : null
  const pctWithDate = safePct(totalWithDate, totalEvents)
  const pctWithoutDate = safePct(totalWithoutDate, totalEvents)

  // Stage with most next actions
  const stageTotals: Record<string, number> = {}
  for (const a of actions) {
    for (const [stage, count] of Object.entries(a.byStage)) {
      stageTotals[stage] = (stageTotals[stage] ?? 0) + count
    }
  }
  const topStage = Object.keys(stageTotals).length > 0
    ? Object.entries(stageTotals).reduce<{ stage: string; count: number }>(
        (best, [stage, count]) => count > best.count ? { stage, count } : best,
        { stage: '', count: 0 }
      )
    : null

  const maxTotal = actions.length > 0 ? actions[0].total : 1

  // ==========================================================================
  // Loading / Error states
  // ==========================================================================
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0c0c0c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#666', fontSize: 14 }}>
          <IconLoader />
          Carregando...
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: '#0c0c0c',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            background: '#0f0f0f',
            border: '1px solid #333',
            borderRadius: 12,
            padding: '24px 32px',
            maxWidth: 420,
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#ef4444', fontSize: 14, margin: 0 }}>{error}</p>
          <a
            href="/login"
            style={{
              display: 'inline-block',
              marginTop: 16,
              fontSize: 13,
              color: '#60a5fa',
              textDecoration: 'none',
            }}
          >
            Ir para o login
          </a>
        </div>
      </div>
    )
  }

  // ==========================================================================
  // Render
  // ==========================================================================
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
            <span style={{ color: ACCENT }}>
              <IconListCheck />
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Próximas Ações
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Visão consolidada das próximas ações registradas no período — frequência, distribuição por etapa e agendamento
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
            { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa', active: false, comingSoon: false },
            { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao', active: false, comingSoon: false },
            { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas', active: false, comingSoon: false },
            { label: 'Próximas Ações', href: null, active: true, comingSoon: false },
            { label: 'Canais', href: '/relatorios/operacao/canais', active: false, comingSoon: false },
            { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor', active: false, comingSoon: false },
          ].map((tab) => {
            if (tab.active) {
              return (
                <button
                  key={tab.label}
                  disabled
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: `2px solid ${ACCENT}`,
                    cursor: 'default',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: ACCENT,
                    marginBottom: -1,
                  }}
                >
                  {tab.label}
                </button>
              )
            }
            if (tab.href) {
              return (
                <a
                  key={tab.label}
                  href={tab.href}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    borderBottom: '2px solid transparent',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 400,
                    color: '#555',
                    textDecoration: 'none',
                    marginBottom: -1,
                    transition: 'color 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.color = '#aaa')}
                  onMouseOut={(e) => (e.currentTarget.style.color = '#555')}
                >
                  {tab.label}
                </a>
              )
            }
            return (
              <button
                key={tab.label}
                disabled
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '2px solid transparent',
                  cursor: 'not-allowed',
                  padding: '8px 14px',
                  fontSize: 13,
                  fontWeight: 400,
                  color: '#444',
                  marginBottom: -1,
                }}
              >
                {tab.label}
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
              </button>
            )
          })}
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

          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
              Etapa
            </label>
            <select
              value={selectedStage}
              onChange={(e) => setSelectedStage(e.target.value)}
              style={{
                background: '#151515',
                border: '1px solid #2a2a2a',
                borderRadius: 8,
                color: 'white',
                fontSize: 13,
                padding: '6px 10px',
                outline: 'none',
                minWidth: 150,
              }}
            >
              <option value="">Todas as etapas</option>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          {dataLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555', fontSize: 12 }}>
              <IconLoader />
              Atualizando...
            </div>
          )}
        </div>

        {/* Executive Summary — 5 cards */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
          <SummaryCard
            label="Próxima ação mais frequente"
            value={topAction ? topAction.label : '—'}
            sub={topAction ? `${topAction.total}× registrada` : 'sem dados'}
            accent={ACCENT}
            icon={<IconListCheck />}
          />
          <SummaryCard
            label="Total com data agendada"
            value={totalWithDate > 0 ? `${totalWithDate}` : '—'}
            sub={totalWithDate > 0 ? `${pctWithDate}% dos registros` : 'sem dados'}
            accent="#34d399"
            icon={<IconCalendar />}
          />
          <SummaryCard
            label="Total sem data"
            value={totalWithoutDate > 0 ? `${totalWithoutDate}` : '—'}
            sub={totalWithoutDate > 0 ? `${pctWithoutDate}% dos registros` : 'sem dados'}
            accent="#f87171"
            icon={<IconCalendar />}
          />
          <SummaryCard
            label="Etapa com mais agendamentos"
            value={topStage ? (STAGE_LABELS[topStage.stage] ?? topStage.stage) : '—'}
            sub={topStage ? `${topStage.count} ocorrência(s)` : 'sem dados'}
            accent={topStage ? (STAGE_COLORS[topStage.stage] ?? '#555') : undefined}
            icon={<IconLayers />}
          />
          <SummaryCard
            label="Total de registros"
            value={totalEvents > 0 ? `${totalEvents}` : '—'}
            sub={totalEvents > 0 ? `no período selecionado` : 'sem dados'}
            accent="#aaa"
            icon={<IconHash />}
          />
        </div>

        {/* Main table section */}
        <div
          style={{
            background: '#0f0f0f',
            border: '1px solid #1e1e1e',
            borderRadius: 14,
            padding: '20px 24px',
            marginBottom: 20,
          }}
        >
          {/* Section header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 16,
              paddingBottom: 14,
              borderBottom: '1px solid #1a1a1a',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: ACCENT }}>
                <IconListCheck />
              </span>
              <div>
                <h2 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'white' }}>
                  Próximas Ações Registradas
                </h2>
                <p style={{ fontSize: 12, color: '#555', margin: '2px 0 0' }}>
                  Todas as próximas ações definidas no período, agrupadas por texto
                </p>
              </div>
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
              {totalEvents}{' '}
              <span style={{ fontSize: 11, fontWeight: 400, color: '#555' }}>registro(s)</span>
            </span>
          </div>

          {/* Column headers */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '0 0 6px',
              borderBottom: '1px solid #161616',
              marginBottom: 2,
            }}
          >
            <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
              Ação
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, width: 60 }}>
              Etapas
            </span>
            <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
              Volume
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
              C/ data
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, minWidth: 28, textAlign: 'right' }}>
              S/ data
            </span>
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', flexShrink: 0, minWidth: 24, textAlign: 'right' }}>
              Qtd
            </span>
          </div>

          {actions.length > 0 ? (
            actions.map((stat) => (
              <ActionRow key={stat.label} stat={stat} maxTotal={maxTotal} />
            ))
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Legend */}
        <div
          style={{
            marginTop: 8,
            padding: '14px 20px',
            background: '#0a0a0a',
            border: '1px solid #161616',
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: 11, color: '#444', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase' }}>
            Legenda de etapas
          </span>
          {STAGE_ORDER.map((stage) => (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: '50%',
                  background: STAGE_COLORS[stage],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: '#555' }}>{STAGE_LABELS[stage]}</span>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 12, height: 4, borderRadius: 2, background: DOT_COLOR }} />
              <span style={{ fontSize: 11, color: '#555' }}>Próximas Ações</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
