'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { fetchAllCycleEvents } from '@/app/lib/supabasePaginatedFetch'
import { STAGE_LABELS } from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'
import { extractChannelFromEvent, CHANNEL_LABELS } from '@/app/config/channelNormalization'

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

function fmtPct(n: number): string {
  return `${n}%`
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

interface ConsultantStat {
  sellerId: string
  sellerName: string
  totalActivities: number
  totalAdvances: number
  totalWon: number
  totalLost: number
  totalNextActions: number
  uniqueCycles: number
  advanceRate: number
  winRate: number
  disciplineRate: number
  topStage: string | null
  topChannel: string | null
  channelBreakdown: Record<string, number>
}

type SortKey =
  | 'name'
  | 'activities'
  | 'cycles'
  | 'advances'
  | 'won'
  | 'lost'
  | 'advanceRate'
  | 'winRate'
  | 'discipline'

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

const ACCENT = '#38bdf8'

// ============================================================================
// Core analytics
// ============================================================================

function buildConsultantStats(
  events: RawEvent[],
  sellers: SellerOption[],
  dateStart: string,
  dateEnd: string,
  isAdmin: boolean,
  currentUserId: string | null,
  selectedSellerId: string | null,
  stageFilter: string,
): ConsultantStat[] {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  // Map seller IDs to display names
  const sellerNameMap = new Map<string, string>()
  for (const s of sellers) {
    sellerNameMap.set(s.id, s.full_name ?? 'Sem nome')
  }
  if (!isAdmin && currentUserId && !sellerNameMap.has(currentUserId)) {
    sellerNameMap.set(currentUserId, 'Você')
  }

  // Per-seller accumulators
  const statsMap = new Map<string, {
    totalActivities: number
    totalAdvances: number
    totalWon: number
    totalLost: number
    totalNextActions: number
    uniqueCycles: Set<string>
    stageCount: Record<string, number>
    channelCount: Record<string, number>
  }>()

  function getOrCreate(id: string) {
    if (!statsMap.has(id)) {
      statsMap.set(id, {
        totalActivities: 0,
        totalAdvances: 0,
        totalWon: 0,
        totalLost: 0,
        totalNextActions: 0,
        uniqueCycles: new Set(),
        stageCount: {},
        channelCount: {},
      })
    }
    return statsMap.get(id)!
  }

  for (const ev of events) {
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue

    const sellerId = ev.created_by
    if (!sellerId) continue

    // Non-admin: only their own events
    if (!isAdmin && sellerId !== currentUserId) continue

    // Admin with single seller filter
    if (isAdmin && selectedSellerId && sellerId !== selectedSellerId) continue

    const meta = (ev.metadata ?? {}) as Record<string, unknown>
    const kind = classifyEvent({ event_type: ev.event_type, metadata: ev.metadata ?? {} })

    // Stage filter
    if (stageFilter) {
      const stage = String(
        meta.from_status ?? meta.from_stage ?? meta.stage ?? ''
      ).toLowerCase() || 'desconhecido'
      if (stage !== stageFilter) continue
    }

    const stat = getOrCreate(sellerId)

    if (ev.cycle_id) stat.uniqueCycles.add(ev.cycle_id)

    if (kind === 'activity') {
      stat.totalActivities++
      const stage = String(
        meta.from_status ?? meta.from_stage ?? meta.stage ?? ''
      ).toLowerCase() || 'desconhecido'
      stat.stageCount[stage] = (stat.stageCount[stage] ?? 0) + 1
      const channel = extractChannelFromEvent(meta)
      if (channel) stat.channelCount[channel] = (stat.channelCount[channel] ?? 0) + 1
    } else if (kind === 'stage_move') {
      stat.totalAdvances++
    } else if (kind === 'won') {
      stat.totalWon++
    } else if (kind === 'lost') {
      stat.totalLost++
    } else if (kind === 'next_action') {
      stat.totalNextActions++
    }
  }

  const result: ConsultantStat[] = []
  for (const [sellerId, s] of statsMap.entries()) {
    const totalClosed = s.totalWon + s.totalLost
    const topStageEntry = Object.entries(s.stageCount).sort((a, b) => b[1] - a[1])[0]
    const topChannelEntry = Object.entries(s.channelCount).sort((a, b) => b[1] - a[1])[0]

    result.push({
      sellerId,
      sellerName: sellerNameMap.get(sellerId) ?? sellerId,
      totalActivities: s.totalActivities,
      totalAdvances: s.totalAdvances,
      totalWon: s.totalWon,
      totalLost: s.totalLost,
      totalNextActions: s.totalNextActions,
      uniqueCycles: s.uniqueCycles.size,
      advanceRate: safePct(s.totalAdvances, s.totalActivities),
      winRate: safePct(s.totalWon, totalClosed),
      disciplineRate: safePct(s.totalNextActions, s.totalActivities),
      topStage: topStageEntry ? topStageEntry[0] : null,
      topChannel: topChannelEntry ? topChannelEntry[0] : null,
      channelBreakdown: s.channelCount,
    })
  }

  return result
}

function sortStats(stats: ConsultantStat[], key: SortKey, dir: 'asc' | 'desc'): ConsultantStat[] {
  const multiplier = dir === 'asc' ? 1 : -1
  return [...stats].sort((a, b) => {
    let va: number | string = 0
    let vb: number | string = 0
    switch (key) {
      case 'name':       va = a.sellerName; vb = b.sellerName; break
      case 'activities': va = a.totalActivities; vb = b.totalActivities; break
      case 'cycles':     va = a.uniqueCycles; vb = b.uniqueCycles; break
      case 'advances':   va = a.totalAdvances; vb = b.totalAdvances; break
      case 'won':        va = a.totalWon; vb = b.totalWon; break
      case 'lost':       va = a.totalLost; vb = b.totalLost; break
      case 'advanceRate': va = a.advanceRate; vb = b.advanceRate; break
      case 'winRate':    va = a.winRate; vb = b.winRate; break
      case 'discipline': va = a.disciplineRate; vb = b.disciplineRate; break
    }
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb) * multiplier
    }
    return ((va as number) - (vb as number)) * multiplier
  })
}

// ============================================================================
// SVG Icons
// ============================================================================

function IconUsers() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconActivity() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconTrendUp() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M22 7l-8.5 8.5-5-5L2 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 7h6v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCircleCheck() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12l3 3 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}


function IconShieldCheck() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconSortAsc() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4l-6 8h12l-6-8zM12 20l-6-8h12l-6 8z" fill="currentColor" opacity="0.3" />
      <path d="M12 4l-6 8h12l-6-8z" fill="currentColor" />
    </svg>
  )
}

function IconSortDesc() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4l-6 8h12l-6-8zM12 20l-6-8h12l-6 8z" fill="currentColor" opacity="0.3" />
      <path d="M12 20l-6-8h12l-6 8z" fill="currentColor" />
    </svg>
  )
}

function IconSort() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 4l-6 8h12l-6-8zM12 20l-6-8h12l-6 8z" fill="currentColor" opacity="0.3" />
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

function IconUser() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="12" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
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

function RateBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        width: 48,
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

function StageDots({ topStage }: { topStage: string | null }) {
  if (!topStage) return null
  const color = STAGE_COLORS[topStage] ?? '#555'
  const label = STAGE_LABELS[topStage] ?? topStage
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: color,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: 11, color: '#666' }}>{label}</span>
    </div>
  )
}

// ============================================================================
// Table header cell with sort support
// ============================================================================

function ThCell({
  label,
  sortKey,
  currentSortKey,
  currentSortDir,
  onSort,
  align,
  minWidth,
}: {
  label: string
  sortKey: SortKey
  currentSortKey: SortKey
  currentSortDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
  minWidth?: number
}) {
  const isActive = currentSortKey === sortKey
  return (
    <th
      style={{
        textAlign: align ?? 'right',
        padding: '8px 10px',
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: isActive ? ACCENT : '#444',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        minWidth: minWidth,
      }}
      onClick={() => onSort(sortKey)}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {label}
        {isActive
          ? currentSortDir === 'desc' ? <IconSortDesc /> : <IconSortAsc />
          : <IconSort />
        }
      </span>
    </th>
  )
}

// ============================================================================
// Consultant table row
// ============================================================================

function ConsultantRow({ stat, rank }: { stat: ConsultantStat; rank: number }) {
  const totalClosed = stat.totalWon + stat.totalLost
  const channel = stat.topChannel ? (CHANNEL_LABELS[stat.topChannel] ?? stat.topChannel) : null

  return (
    <tr
      style={{
        borderBottom: '1px solid #181818',
      }}
    >
      {/* Rank */}
      <td style={{ padding: '12px 10px', textAlign: 'right', color: '#444', fontSize: 11, width: 28 }}>
        {rank}
      </td>

      {/* Name */}
      <td style={{ padding: '12px 10px', textAlign: 'left' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#555' }}><IconUser /></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'white', whiteSpace: 'nowrap' }}>
              {stat.sellerName}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              {stat.topStage && <StageDots topStage={stat.topStage} />}
              {channel && (
                <span style={{ fontSize: 11, color: '#444' }}>{channel}</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Atividades */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: ACCENT }}>{stat.totalActivities}</span>
      </td>

      {/* Leads */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 13, color: '#888' }}>{stat.uniqueCycles}</span>
      </td>

      {/* Avanços */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 13, color: '#888' }}>{stat.totalAdvances}</span>
      </td>

      {/* Taxa de avanço */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <RateBar value={stat.advanceRate} color="#34d399" />
          <span style={{ fontSize: 12, color: '#34d399', minWidth: 32, textAlign: 'right' }}>
            {fmtPct(stat.advanceRate)}
          </span>
        </div>
      </td>

      {/* Ganhos */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 13, color: stat.totalWon > 0 ? '#34d399' : '#555' }}>
          {stat.totalWon}
        </span>
      </td>

      {/* Perdas */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 13, color: stat.totalLost > 0 ? '#f87171' : '#555' }}>
          {stat.totalLost}
        </span>
      </td>

      {/* Taxa de ganho */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        {totalClosed > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            <RateBar value={stat.winRate} color="#34d399" />
            <span style={{ fontSize: 12, color: '#888', minWidth: 32, textAlign: 'right' }}>
              {fmtPct(stat.winRate)}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#333' }}>—</span>
        )}
      </td>

      {/* Próximas ações */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        <span style={{ fontSize: 13, color: '#888' }}>{stat.totalNextActions}</span>
      </td>

      {/* Disciplina */}
      <td style={{ padding: '12px 10px', textAlign: 'right' }}>
        {stat.totalActivities > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
            <RateBar value={stat.disciplineRate} color={ACCENT} />
            <span style={{ fontSize: 12, color: '#888', minWidth: 32, textAlign: 'right' }}>
              {fmtPct(stat.disciplineRate)}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: 12, color: '#333' }}>—</span>
        )}
      </td>
    </tr>
  )
}

// ============================================================================
// Sub-navigation (shared across operational reports)
// ============================================================================

const SUBNAV_TABS = [
  { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa' },
  { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
  { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
  { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
  { label: 'Canais', href: '/relatorios/operacao/canais' },
  { label: 'Desempenho por Consultor', href: null }, // active page
]

// ============================================================================
// Main Page
// ============================================================================

export default function DesempenhoConsultorPage() {
  const supabase = supabaseBrowser()

  // Auth/profile state
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
  const [stats, setStats] = React.useState<ConsultantStat[]>([])
  const [dataLoading, setDataLoading] = React.useState(false)

  // Sort
  const [sortKey, setSortKey] = React.useState<SortKey>('activities')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')

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
      // Fetch all events without seller filter — per-seller grouping done in JS
      const data = await fetchAllCycleEvents(supabase, {
        companyId,
        dateStart,
        dateEnd,
        columns: 'id, cycle_id, event_type, metadata, occurred_at, created_by',
      })

      const result = buildConsultantStats(
        (data ?? []) as RawEvent[],
        sellers,
        dateStart,
        dateEnd,
        isAdmin,
        currentUserId,
        selectedSellerId,
        selectedStage,
      )
      setStats(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
    } finally {
      setDataLoading(false)
    }
  }

  // ==========================================================================
  // Sort handler
  // ==========================================================================
  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // ==========================================================================
  // Derived values
  // ==========================================================================
  const sorted = sortStats(stats, sortKey, sortDir)
  const grandTotal = stats.reduce((s, c) => s + c.totalActivities, 0)
  const totalConsultants = stats.filter(s => s.totalActivities > 0).length

  const topByVolume = stats.length > 0
    ? stats.reduce((best, s) => s.totalActivities > best.totalActivities ? s : best, stats[0])
    : null

  const topByAdvanceRate = stats.filter(s => s.totalActivities >= 3).length > 0
    ? stats.filter(s => s.totalActivities >= 3)
        .reduce((best, s) => s.advanceRate > best.advanceRate ? s : best, stats.filter(s => s.totalActivities >= 3)[0])
    : null

  const topByWinRate = stats.filter(s => (s.totalWon + s.totalLost) >= 2).length > 0
    ? stats.filter(s => (s.totalWon + s.totalLost) >= 2)
        .reduce((best, s) => s.winRate > best.winRate ? s : best, stats.filter(s => (s.totalWon + s.totalLost) >= 2)[0])
    : null

  const topByDiscipline = stats.filter(s => s.totalActivities >= 3).length > 0
    ? stats.filter(s => s.totalActivities >= 3)
        .reduce((best, s) => s.disciplineRate > best.disciplineRate ? s : best, stats.filter(s => s.totalActivities >= 3)[0])
    : null

  // ==========================================================================
  // Loading / Error states
  // ==========================================================================
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
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>

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
              <IconUsers />
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Desempenho por Consultor
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Volume, avanço, conversão e disciplina operacional por consultor
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
          {SUBNAV_TABS.map((tab) => {
            const isActive = tab.href === null
            if (isActive) {
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
            return (
              <a
                key={tab.label}
                href={tab.href!}
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
                minWidth: 160,
              }}
            >
              <option value="">Todas as etapas</option>
              {STAGE_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s] ?? s}
                </option>
              ))}
            </select>
          </div>

          {dataLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#555', fontSize: 12, paddingBottom: 2 }}>
              <IconLoader />
              Atualizando...
            </div>
          )}
        </div>

        {/* Summary cards */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            flexWrap: 'wrap',
            marginBottom: 32,
          }}
        >
          <SummaryCard
            label="Total de Atividades"
            value={grandTotal > 0 ? grandTotal : '—'}
            sub={totalConsultants > 0 ? `${totalConsultants} consultor${totalConsultants === 1 ? '' : 'es'} ativos` : 'sem dados no período'}
            accent={ACCENT}
            icon={<IconActivity />}
          />

          {topByVolume && topByVolume.totalActivities > 0 && (
            <SummaryCard
              label="Mais Ativo"
              value={topByVolume.sellerName}
              sub={`${topByVolume.totalActivities} atividades · ${topByVolume.uniqueCycles} leads`}
              accent="white"
              icon={<IconActivity />}
            />
          )}

          {topByAdvanceRate && (
            <SummaryCard
              label="Maior Taxa de Avanço"
              value={topByAdvanceRate.sellerName}
              sub={`${fmtPct(topByAdvanceRate.advanceRate)} de avanço (${topByAdvanceRate.totalAdvances} avanços)`}
              accent="#34d399"
              icon={<IconTrendUp />}
            />
          )}

          {topByWinRate && (
            <SummaryCard
              label="Maior Taxa de Ganho"
              value={topByWinRate.sellerName}
              sub={`${fmtPct(topByWinRate.winRate)} de conversão (${topByWinRate.totalWon} ganhos)`}
              accent="#34d399"
              icon={<IconCircleCheck />}
            />
          )}

          {topByDiscipline && (
            <SummaryCard
              label="Mais Disciplinado"
              value={topByDiscipline.sellerName}
              sub={`${fmtPct(topByDiscipline.disciplineRate)} de disciplina (${topByDiscipline.totalNextActions} próximas ações)`}
              accent={ACCENT}
              icon={<IconShieldCheck />}
            />
          )}
        </div>

        {/* Main table */}
        {sorted.length === 0 ? (
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #1a1a1a',
              borderRadius: 12,
              padding: '48px 24px',
              textAlign: 'center',
            }}
          >
            <p style={{ color: '#444', fontSize: 14, margin: 0 }}>
              Nenhum dado encontrado para o período e filtros selecionados.
            </p>
          </div>
        ) : (
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #1a1a1a',
              borderRadius: 12,
              overflow: 'hidden',
            }}
          >
            {/* Table header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 20px 10px',
                borderBottom: '1px solid #181818',
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: '#555', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                Ranking de Consultores
              </span>
              <span style={{ fontSize: 11, color: '#333' }}>
                {sorted.length} consultor{sorted.length === 1 ? '' : 'es'}
              </span>
            </div>

            {/* Scrollable table */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                    <th style={{ padding: '8px 10px', width: 28 }} />
                    <ThCell
                      label="Consultor"
                      sortKey="name"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                      align="left"
                      minWidth={180}
                    />
                    <ThCell
                      label="Atividades"
                      sortKey="activities"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ThCell
                      label="Leads"
                      sortKey="cycles"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ThCell
                      label="Avanços"
                      sortKey="advances"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ThCell
                      label="Taxa Avanço"
                      sortKey="advanceRate"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                      minWidth={110}
                    />
                    <ThCell
                      label="Ganhos"
                      sortKey="won"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ThCell
                      label="Perdas"
                      sortKey="lost"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ThCell
                      label="Taxa Ganho"
                      sortKey="winRate"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                      minWidth={110}
                    />
                    <ThCell
                      label="Próx. Ações"
                      sortKey="discipline"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                    />
                    <ThCell
                      label="Disciplina"
                      sortKey="discipline"
                      currentSortKey={sortKey}
                      currentSortDir={sortDir}
                      onSort={handleSort}
                      minWidth={110}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((stat, idx) => (
                    <ConsultantRow key={stat.sellerId} stat={stat} rank={idx + 1} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #181818',
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                flexWrap: 'wrap',
              }}
            >
              <span style={{ fontSize: 11, color: '#333' }}>
                Atividades: interações registradas (ligação, whatsapp, e-mail, visita, etc.)
              </span>
              <span style={{ fontSize: 11, color: '#333' }}>
                Disciplina: proporção de atividades com próxima ação definida
              </span>
              <span style={{ fontSize: 11, color: '#333' }}>
                Etapa destacada: onde o consultor mais atuou
              </span>
            </div>
          </div>
        )}

        {/* Stage color legend */}
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          {STAGE_ORDER.map((stage) => (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: STAGE_COLORS[stage],
                }}
              />
              <span style={{ fontSize: 11, color: '#444' }}>{STAGE_LABELS[stage] ?? stage}</span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}
