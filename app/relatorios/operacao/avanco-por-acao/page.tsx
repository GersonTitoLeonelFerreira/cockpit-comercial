'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import {
  STAGE_ACTIONS,
  STAGE_LABELS,
  extractActionFromEvent,
} from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'

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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
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

interface ActionStats {
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
type ViewMode = 'all' | 'stage'

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

// ============================================================================
// Core analytics: build ActionStats from raw events
// ============================================================================

function buildActionStats(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string | null,
): ActionStats[] {
  // Build cycle map: cycle_id → events sorted ASC by occurred_at
  const cycleMap = new Map<string, RawEvent[]>()
  for (const ev of events) {
    if (!ev.cycle_id) continue
    if (!cycleMap.has(ev.cycle_id)) cycleMap.set(ev.cycle_id, [])
    cycleMap.get(ev.cycle_id)!.push(ev)
  }
  for (const list of cycleMap.values()) {
    list.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
  }

  // Accumulate stats per action ID
  const acc: Record<string, { total: number; advanced: number; won: number; lost: number }> = {}

  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  for (const ev of events) {
    // Only action events within the original date range
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue

    // Apply created_by filter in-memory
    if (isAdmin && selectedSellerId) {
      if (ev.created_by !== selectedSellerId) continue
    } else if (!isAdmin && currentUserId) {
      if (ev.created_by !== currentUserId) continue
    }

    const resolvedId = extractActionFromEvent(ev)
    if (!resolvedId) continue

    // Find subsequent events in the same cycle (including events beyond the date range)
    const cycleEvents = ev.cycle_id ? (cycleMap.get(ev.cycle_id) ?? []) : []
    const idx = cycleEvents.findIndex(e => e.id === ev.id)
    const subsequent = idx >= 0 ? cycleEvents.slice(idx + 1) : []

    let advanced = false
    let won = false
    let lost = false

    for (const next of subsequent) {
      const kind = classifyEvent(next)
      if (kind === 'stage_move') advanced = true
      if (kind === 'won') won = true
      if (kind === 'lost') lost = true
    }

    const s = acc[resolvedId] ?? { total: 0, advanced: 0, won: 0, lost: 0 }
    s.total++
    if (advanced) s.advanced++
    if (won) s.won++
    if (lost) s.lost++
    acc[resolvedId] = s
  }

  // Build final list for all 20 taxonomy actions
  const result: ActionStats[] = []
  for (const stage of STAGE_ORDER) {
    for (const def of STAGE_ACTIONS[stage]) {
      const s = acc[def.id] ?? { total: 0, advanced: 0, won: 0, lost: 0 }
      result.push({
        actionId: def.id,
        label: def.label,
        stage: def.stage,
        category: def.category,
        total: s.total,
        advanced: s.advanced,
        won: s.won,
        lost: s.lost,
        advancePct: safePct(s.advanced, s.total),
        wonPct: safePct(s.won, s.total),
        lostPct: safePct(s.lost, s.total),
      })
    }
  }
  return result
}

// ============================================================================
// SVG Icons
// ============================================================================

function IconTrendUp() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M23 6l-9.5 9.5-5-5L1 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 6h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCircleCheck() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCircleX() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconTarget() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </svg>
  )
}

function IconBarChart2() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M18 20V10M12 20V4M6 20v-6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

function PctBar({
  value,
  color,
  width = 44,
}: {
  value: number
  color: string
  width?: number
}) {
  return (
    <div
      style={{
        width,
        height: 4,
        background: '#1e1e1e',
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: `${value}%`,
          height: '100%',
          background: color,
          borderRadius: 2,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

function VolumeBar({
  value,
  max,
  color,
}: {
  value: number
  max: number
  color: string
}) {
  const fill = max > 0 ? (value / max) * 100 : 0
  return (
    <div
      style={{
        width: 40,
        height: 4,
        background: '#1e1e1e',
        borderRadius: 2,
        overflow: 'hidden',
        flexShrink: 0,
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

function ActionRow({
  stat,
  maxTotal,
}: {
  stat: ActionStats
  maxTotal: number
}) {
  const isZero = stat.total === 0
  const stageColor = STAGE_COLORS[stat.stage] ?? '#555'
  const advanceColor =
    stat.advancePct >= 40 ? '#34d399' : stat.advancePct >= 20 ? '#fbbf24' : '#555'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 0',
        borderBottom: '1px solid #181818',
        opacity: isZero ? 0.35 : 1,
      }}
    >
      {/* Stage dot + label + category badge */}
      <div style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: stageColor,
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: isZero ? '#666' : 'white',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {stat.label}
        </span>
        <CategoryBadge category={stat.category} />
      </div>

      {/* Total */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          flexShrink: 0,
          width: 80,
          justifyContent: 'flex-end',
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 700, color: isZero ? '#555' : 'white' }}>
          {stat.total}
        </span>
        <VolumeBar value={stat.total} max={maxTotal} color={stageColor} />
      </div>

      {/* Advance */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          flexShrink: 0,
          width: 100,
          justifyContent: 'flex-end',
        }}
      >
        <span style={{ fontSize: 11, color: isZero ? '#444' : advanceColor, minWidth: 28, textAlign: 'right' }}>
          {stat.advancePct}%
        </span>
        <PctBar value={stat.advancePct} color={advanceColor} />
      </div>

      {/* Won */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          flexShrink: 0,
          width: 90,
          justifyContent: 'flex-end',
        }}
      >
        <span style={{ fontSize: 11, color: isZero ? '#444' : '#34d399', minWidth: 28, textAlign: 'right' }}>
          {stat.wonPct}%
        </span>
        <PctBar value={stat.wonPct} color="#34d399" />
      </div>

      {/* Lost */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          flexShrink: 0,
          width: 90,
          justifyContent: 'flex-end',
        }}
      >
        <span style={{ fontSize: 11, color: isZero ? '#444' : '#f87171', minWidth: 28, textAlign: 'right' }}>
          {stat.lostPct}%
        </span>
        <PctBar value={stat.lostPct} color="#f87171" />
      </div>
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
  const color = STAGE_COLORS[stage] ?? '#555'
  const label = STAGE_LABELS[stage] ?? stage
  const stageStats = stats.filter(s => s.stage === stage)
  const sorted = [...stageStats].sort((a, b) => b[sortKey] - a[sortKey])
  const maxTotal = Math.max(...stageStats.map(s => s.total), 1)
  const stageTotal = stageStats.reduce((s, a) => s + a.total, 0)

  return (
    <div
      style={{
        background: '#0f0f0f',
        border: '1px solid #1e1e1e',
        borderRadius: 14,
        padding: '20px 24px',
      }}
    >
      {/* Stage header */}
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
              background: color,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 14, fontWeight: 700, color }}>{label}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
          {stageTotal}{' '}
          <span style={{ fontSize: 11, fontWeight: 400, color: '#555' }}>ações</span>
        </span>
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 0 6px',
          borderBottom: '1px solid #161616',
          marginBottom: 2,
        }}
      >
        <span style={{ flex: '1 1 0', fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444' }}>
          Ação
        </span>
        <span style={{ width: 80, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', textAlign: 'right' }}>
          Total
        </span>
        <span style={{ width: 100, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#444', textAlign: 'right' }}>
          Avanço
        </span>
        <span style={{ width: 90, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#34d399', textAlign: 'right' }}>
          Ganho
        </span>
        <span style={{ width: 90, fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#f87171', textAlign: 'right' }}>
          Perda
        </span>
      </div>

      {/* Rows */}
      <div>
        {sorted.map(s => (
          <ActionRow key={s.actionId} stat={s} maxTotal={maxTotal} />
        ))}
      </div>
    </div>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function AvancoPorAcaoPage() {
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
  const [selectedStage, setSelectedStage] = React.useState<string>('')

  // View & sort
  const [viewMode, setViewMode] = React.useState<ViewMode>('all')
  const [sortKey, setSortKey] = React.useState<SortKey>('total')

  // Data
  const [actionStats, setActionStats] = React.useState<ActionStats[]>([])
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
  }, [companyId, dateStart, dateEnd, selectedSellerId, isAdmin, currentUserId])

  async function loadData() {
    if (!companyId) return
    setDataLoading(true)
    try {
      // Fetch events in date range + 45-day look-ahead to capture outcomes
      // that happen after the action but within the same cycle
      const bufferEnd = addDays(dateEnd, 45)

      const { data, error: fetchError } = await supabase
        .from('cycle_events')
        .select('id, cycle_id, event_type, metadata, occurred_at, created_by')
        .eq('company_id', companyId)
        .gte('occurred_at', `${dateStart}T00:00:00`)
        .lte('occurred_at', `${bufferEnd}T23:59:59`)
        .order('occurred_at', { ascending: true })

      if (fetchError) throw fetchError

      const stats = buildActionStats(
        (data ?? []) as RawEvent[],
        dateStart,
        dateEnd,
        selectedSellerId,
        isAdmin,
        currentUserId,
      )
      setActionStats(stats)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
    } finally {
      setDataLoading(false)
    }
  }

  // ==========================================================================
  // Derived values
  // ==========================================================================

  const activeStats = actionStats.filter(s => s.total > 0)
  const filteredStats = selectedStage
    ? actionStats.filter(s => s.stage === selectedStage)
    : actionStats

  const sortedAll = [...filteredStats].sort((a, b) => b[sortKey] - a[sortKey])
  const maxTotal = Math.max(...actionStats.map(s => s.total), 1)

  const topAdvance = activeStats.length > 0
    ? activeStats.reduce((best, s) => (s.advancePct > best.advancePct ? s : best), activeStats[0])
    : null

  const topWon = activeStats.length > 0
    ? activeStats.reduce((best, s) => (s.wonPct > best.wonPct ? s : best), activeStats[0])
    : null

  const topLost = activeStats.length > 0
    ? activeStats.reduce((best, s) => (s.lostPct > best.lostPct ? s : best), activeStats[0])
    : null

  const mostUsed = activeStats.length > 0
    ? activeStats.reduce((best, s) => (s.total > best.total ? s : best), activeStats[0])
    : null

  const bestStage = STAGE_ORDER.reduce<{ stage: string; avgAdv: number } | null>((best, stage) => {
    const group = activeStats.filter(s => s.stage === stage)
    if (group.length === 0) return best
    const avg = group.reduce((sum, s) => sum + s.advancePct, 0) / group.length
    if (!best || avg > best.avgAdv) return { stage, avgAdv: avg }
    return best
  }, null)

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
            <span style={{ color: '#34d399' }}>
              <IconTrendUp />
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Avanço por Ação
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Quais ações realmente movem o funil — avanço, ganho e perda por ação registrada
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
            { label: 'Avanço por Ação', href: null, active: true, comingSoon: false },
            { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas', active: false, comingSoon: false },
            { label: 'Próximas Ações', href: null, active: false, comingSoon: true },
            { label: 'Canais', href: null, active: false, comingSoon: true },
            { label: 'Desempenho por Consultor', href: null, active: false, comingSoon: true },
          ].map((tab) => {
            if (tab.active) {
              return (
                <button
                  key={tab.label}
                  disabled
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: '2px solid #34d399',
                    cursor: 'default',
                    padding: '8px 14px',
                    fontSize: 13,
                    fontWeight: 600,
                    color: '#34d399',
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
            label="Maior taxa de avanço"
            value={topAdvance ? topAdvance.label : '—'}
            sub={topAdvance ? `${topAdvance.advancePct}% de avanço` : 'sem dados'}
            accent="#34d399"
            icon={<IconTrendUp />}
          />
          <SummaryCard
            label="Maior associação a ganho"
            value={topWon ? topWon.label : '—'}
            sub={topWon ? `${topWon.wonPct}% de ganho` : 'sem dados'}
            accent="#34d399"
            icon={<IconCircleCheck />}
          />
          <SummaryCard
            label="Maior associação a perda"
            value={topLost ? topLost.label : '—'}
            sub={topLost ? `${topLost.lostPct}% de perda` : 'sem dados'}
            accent="#f87171"
            icon={<IconCircleX />}
          />
          <SummaryCard
            label="Ação mais usada"
            value={mostUsed ? mostUsed.label : '—'}
            sub={mostUsed ? `${mostUsed.total}× registrada` : 'sem dados'}
            icon={<IconBarChart2 />}
          />
          <SummaryCard
            label="Melhor etapa"
            value={bestStage ? (STAGE_LABELS[bestStage.stage] ?? bestStage.stage) : '—'}
            sub={bestStage ? `${Math.round(bestStage.avgAdv)}% de avanço médio` : 'sem dados'}
            accent={bestStage ? STAGE_COLORS[bestStage.stage] : undefined}
            icon={<IconTarget />}
          />
        </div>

        {/* View toggle + sort */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {/* View toggle */}
          <div
            style={{
              display: 'flex',
              background: '#0f0f0f',
              border: '1px solid #1e1e1e',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            {([
              { key: 'all' as ViewMode, label: 'Todas as ações' },
              { key: 'stage' as ViewMode, label: 'Por etapa' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setViewMode(key)}
                style={{
                  background: viewMode === key ? '#1e1e1e' : 'none',
                  border: 'none',
                  color: viewMode === key ? 'white' : '#555',
                  fontSize: 13,
                  fontWeight: viewMode === key ? 600 : 400,
                  padding: '7px 16px',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Sort control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#555' }}>
              Ordenar por
            </span>
            {([
              { key: 'total' as SortKey, label: 'Volume' },
              { key: 'advancePct' as SortKey, label: 'Avanço %' },
              { key: 'wonPct' as SortKey, label: 'Ganho %' },
              { key: 'lostPct' as SortKey, label: 'Perda %' },
            ] as const).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                style={{
                  background: sortKey === key ? '#1e1e1e' : 'none',
                  border: `1px solid ${sortKey === key ? '#2e2e2e' : '#1a1a1a'}`,
                  color: sortKey === key ? 'white' : '#555',
                  fontSize: 12,
                  fontWeight: sortKey === key ? 600 : 400,
                  padding: '5px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        {viewMode === 'all' ? (
          /* ── All Actions Table ── */
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #1e1e1e',
              borderRadius: 14,
              padding: '20px 24px',
            }}
          >
            {/* Column headers */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 0 10px',
                borderBottom: '1px solid #1a1a1a',
                marginBottom: 2,
              }}
            >
              <span
                style={{
                  flex: '1 1 0',
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: '#444',
                }}
              >
                Ação
              </span>
              <span
                style={{
                  width: 80,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: '#444',
                  textAlign: 'right',
                }}
              >
                Total
              </span>
              <span
                style={{
                  width: 100,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: '#444',
                  textAlign: 'right',
                }}
              >
                Avanço %
              </span>
              <span
                style={{
                  width: 90,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: '#34d399',
                  textAlign: 'right',
                }}
              >
                Ganho %
              </span>
              <span
                style={{
                  width: 90,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: '0.07em',
                  textTransform: 'uppercase',
                  color: '#f87171',
                  textAlign: 'right',
                }}
              >
                Perda %
              </span>
            </div>

            {/* Rows */}
            <div>
              {sortedAll.map((s) => (
                <ActionRow key={s.actionId} stat={s} maxTotal={maxTotal} />
              ))}
            </div>

            {/* Volume vs Efficacy legend */}
            {activeStats.length > 0 && (
              <div
                style={{
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: '1px solid #181818',
                  display: 'flex',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.07em',
                    textTransform: 'uppercase',
                    color: '#444',
                    alignSelf: 'center',
                  }}
                >
                  Eficácia
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: '#34d399' }} />
                  <span style={{ fontSize: 11, color: '#666' }}>Alta (≥ 40% de avanço)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: '#fbbf24' }} />
                  <span style={{ fontSize: 11, color: '#666' }}>Média (20–39%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: '#555' }} />
                  <span style={{ fontSize: 11, color: '#666' }}>Baixa (abaixo de 20%)</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ── Per Stage Breakdown ── */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {STAGE_ORDER.filter(stage => !selectedStage || stage === selectedStage).map((stage) => (
              <StageSection
                key={stage}
                stage={stage}
                stats={actionStats}
                sortKey={sortKey}
              />
            ))}
          </div>
        )}

        {/* Zero state hint */}
        {activeStats.length === 0 && !dataLoading && (
          <div
            style={{
              marginTop: 24,
              padding: '24px 20px',
              background: '#0f0f0f',
              border: '1px solid #1e1e1e',
              borderRadius: 12,
              textAlign: 'center',
            }}
          >
            <p style={{ color: '#555', fontSize: 13, margin: 0 }}>
              Nenhuma ação encontrada no período selecionado.
            </p>
            <p style={{ color: '#444', fontSize: 12, margin: '6px 0 0' }}>
              Tente ampliar o intervalo de datas ou remover filtros.
            </p>
          </div>
        )}

      </div>
    </div>
  )
}
