'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { fetchAllCycleEvents } from '@/app/lib/supabasePaginatedFetch'
import { classifyEvent } from '@/app/config/eventClassification'

// ============================================================================
// Constants
// ============================================================================

const ACCENT = '#38bdf8'
const STALE_DAYS = 14 // days without update = stale lead

// Score classification thresholds
const SCORE_SAUDAVEL = 70
const SCORE_ATENCAO = 40

const DIM_LABELS = ['Registro', 'Agenda', 'Carteira', 'Aderência'] as const

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

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

// Count Mon–Fri working days in [start, end] (inclusive)
function countWorkingDays(start: string, end: string): number {
  const s = new Date(`${start}T12:00:00`)
  const e = new Date(`${end}T12:00:00`)
  let count = 0
  const cur = new Date(s)
  while (cur <= e) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) count++
    cur.setDate(cur.getDate() + 1)
  }
  return Math.max(count, 1)
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('')
}

function scoreClassification(score: number): 'saudavel' | 'atencao' | 'critico' {
  if (score >= SCORE_SAUDAVEL) return 'saudavel'
  if (score >= SCORE_ATENCAO) return 'atencao'
  return 'critico'
}

function classificationLabel(c: 'saudavel' | 'atencao' | 'critico'): string {
  if (c === 'saudavel') return 'Saudável'
  if (c === 'atencao') return 'Atenção'
  return 'Crítico'
}

function classificationColor(c: 'saudavel' | 'atencao' | 'critico'): string {
  if (c === 'saudavel') return '#34d399'
  if (c === 'atencao') return '#fbbf24'
  return '#f87171'
}

function classificationBg(c: 'saudavel' | 'atencao' | 'critico'): string {
  if (c === 'saudavel') return 'rgba(52,211,153,0.08)'
  if (c === 'atencao') return 'rgba(251,191,36,0.08)'
  return 'rgba(248,113,113,0.08)'
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

interface RawCycle {
  owner_user_id: string | null
  status: string | null
  updated_at: string | null
  next_action_date: string | null
  next_action_at: string | null
}

interface SellerScore {
  sellerId: string
  sellerName: string
  initials: string
  // Raw data (for auditability)
  activities: number
  daysWithActivity: number
  workingDays: number
  nextActions: number
  overdueNextActions: number
  advances: number
  uniqueCycles: number
  totalActiveLeads: number
  staleLeads: number
  leadsWithoutNextAction: number
  // Dimension scores (0-100)
  dim1: number
  dim2: number
  dim3: number
  dim4: number
  // Final composite
  score: number
  classification: 'saudavel' | 'atencao' | 'critico'
  strongDimIdx: number
  weakDimIdx: number
}

type SortKey = 'score' | 'dim1' | 'dim2' | 'dim3' | 'dim4' | 'name'

// ============================================================================
// Score computation
// ============================================================================

/**
 * Computes Dimension 1 score (Registro de Atividades) — 0 to 100.
 *
 * - Volume component (60 pts): based on activities per working day.
 *   Target: 2 per day = 60 pts. Linear interpolation.
 * - Frequency component (40 pts): days with ≥1 activity / total working days.
 */
function computeDim1(activities: number, daysWithActivity: number, workingDays: number): number {
  const actPerDay = activities / workingDays
  const volScore = clamp((actPerDay / 2) * 60, 0, 60)
  const freqScore = (daysWithActivity / workingDays) * 40
  return Math.round(volScore + freqScore)
}

/**
 * Computes Dimension 2 score (Disciplina de Próxima Ação) — 0 to 100.
 *
 * - Base: nextActions / activities × 100 (capped at 100)
 *   Measures how often the consultant commits to a next action after every activity.
 * - Overdue penalty: (overdue / nextActions) × 50 pts
 *   Penalizes a backlogged, unexecuted agenda.
 */
function computeDim2(activities: number, nextActions: number, overdueNextActions: number): number {
  if (activities === 0) return 0
  const base = clamp((nextActions / activities) * 100, 0, 100)
  const overduePenalty = nextActions > 0 ? (overdueNextActions / nextActions) * 50 : 0
  return Math.max(0, Math.round(base - overduePenalty))
}

/**
 * Computes Dimension 3 score (Saúde da Carteira) — 0 to 100.
 *
 * Based on the current state of active leads in the consultant's portfolio:
 * - Freshness component (70 pts): proportion of leads updated within STALE_DAYS.
 * - Next-action component (30 pts): proportion of leads with a next action set.
 *
 * Returns 50 (neutral) if the consultant has no active leads.
 */
function computeDim3(totalActiveLeads: number, staleLeads: number, leadsWithoutNextAction: number): number {
  if (totalActiveLeads === 0) return 50
  const freshPct = (totalActiveLeads - staleLeads) / totalActiveLeads
  const nextActionPct = (totalActiveLeads - leadsWithoutNextAction) / totalActiveLeads
  const score = freshPct * 70 + nextActionPct * 30
  return Math.round(clamp(score, 0, 100))
}

/**
 * Computes Dimension 4 score (Aderência ao Processo) — 0 to 100.
 *
 * - Base (80 pts): activities per unique cycle worked.
 *   Target: 3 activities per cycle = 80 pts.
 * - Advance bonus (20 pts): ratio of cycles that saw at least one stage move.
 *   A consultant who documents activity AND advances leads scores highest.
 * - Superficial penalty (−20 pts): if advances > activities, the consultant is
 *   moving stages without adequate documentation.
 */
function computeDim4(activities: number, advances: number, uniqueCycles: number): number {
  if (uniqueCycles === 0) return 0
  const actPerCycle = activities / uniqueCycles
  const baseScore = clamp((actPerCycle / 3) * 80, 0, 80)
  const advanceRatio = advances / uniqueCycles
  const advanceBonus = Math.min(20, (advanceRatio / 0.3) * 20)
  const superficialPenalty = activities > 0 && advances > activities ? 20 : 0
  return Math.max(0, Math.min(100, Math.round(baseScore + advanceBonus - superficialPenalty)))
}

function buildAdherenceScores(
  events: RawEvent[],
  activeCycles: RawCycle[],
  sellers: SellerOption[],
  dateStart: string,
  dateEnd: string,
  isAdmin: boolean,
  currentUserId: string | null,
  selectedSellerId: string | null,
  memberIds: Set<string>,
  todayStr: string,
): SellerScore[] {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`
  const workingDays = countWorkingDays(dateStart, dateEnd)

  // Threshold for stale detection
  const staleThreshold = new Date(todayStr)
  staleThreshold.setDate(staleThreshold.getDate() - STALE_DAYS)
  const staleThresholdStr = staleThreshold.toISOString().slice(0, 10)

  // Build seller name map
  const sellerNameMap = new Map<string, string>()
  for (const s of sellers) {
    sellerNameMap.set(s.id, s.full_name ?? 'Sem nome')
  }
  if (!isAdmin && currentUserId && !sellerNameMap.has(currentUserId)) {
    sellerNameMap.set(currentUserId, 'Você')
  }

  // Per-seller event accumulators
  const sellerActivities = new Map<string, number>()
  const sellerActivityDates = new Map<string, Set<string>>()
  const sellerNextActions = new Map<string, number>()
  const sellerOverdue = new Map<string, number>()
  const sellerAdvances = new Map<string, number>()
  const sellerCycles = new Map<string, Set<string>>()

  for (const ev of events) {
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue

    // Seller attribution: owner from metadata → cycle owner → created_by if member
    const meta = (ev.metadata ?? {}) as Record<string, unknown>
    const metaOwner = meta.owner_user_id as string | undefined
    const createdByFallback = ev.created_by && memberIds.has(ev.created_by) ? ev.created_by : undefined
    const sellerId = metaOwner ?? createdByFallback
    if (!sellerId) continue

    // Non-admin: only own events
    if (!isAdmin && sellerId !== currentUserId) continue
    // Admin single-seller filter
    if (isAdmin && selectedSellerId && sellerId !== selectedSellerId) continue

    const kind = classifyEvent({ event_type: ev.event_type, metadata: ev.metadata ?? {} })

    // Track unique cycles
    if (ev.cycle_id) {
      if (!sellerCycles.has(sellerId)) sellerCycles.set(sellerId, new Set())
      sellerCycles.get(sellerId)!.add(ev.cycle_id)
    }

    if (kind === 'activity') {
      sellerActivities.set(sellerId, (sellerActivities.get(sellerId) ?? 0) + 1)
      // Track date for frequency
      const date = ev.occurred_at.slice(0, 10)
      if (!sellerActivityDates.has(sellerId)) sellerActivityDates.set(sellerId, new Set())
      sellerActivityDates.get(sellerId)!.add(date)
    } else if (kind === 'next_action') {
      sellerNextActions.set(sellerId, (sellerNextActions.get(sellerId) ?? 0) + 1)
      // Check overdue
      const dueDate = String(
        meta.due_date ?? meta.scheduled_at ?? meta.next_action_date ?? ''
      ).trim()
      if (dueDate && dueDate.slice(0, 10) < todayStr) {
        sellerOverdue.set(sellerId, (sellerOverdue.get(sellerId) ?? 0) + 1)
      }
    } else if (kind === 'stage_move') {
      sellerAdvances.set(sellerId, (sellerAdvances.get(sellerId) ?? 0) + 1)
    }
  }

  // Per-seller portfolio health (from active cycles — not filtered by event period)
  const sellerTotalLeads = new Map<string, number>()
  const sellerStaleLeads = new Map<string, number>()
  const sellerLeadsWithoutNextAction = new Map<string, number>()

  for (const cycle of activeCycles) {
    const ownerId = cycle.owner_user_id
    if (!ownerId) continue
    if (!isAdmin && ownerId !== currentUserId) continue
    if (isAdmin && selectedSellerId && ownerId !== selectedSellerId) continue

    sellerTotalLeads.set(ownerId, (sellerTotalLeads.get(ownerId) ?? 0) + 1)

    // Stale: not updated in STALE_DAYS days
    const updatedAt = cycle.updated_at ? cycle.updated_at.slice(0, 10) : ''
    if (!updatedAt || updatedAt < staleThresholdStr) {
      sellerStaleLeads.set(ownerId, (sellerStaleLeads.get(ownerId) ?? 0) + 1)
    }

    // No next action
    const hasNextAction = !!(cycle.next_action_date || cycle.next_action_at)
    if (!hasNextAction) {
      sellerLeadsWithoutNextAction.set(ownerId, (sellerLeadsWithoutNextAction.get(ownerId) ?? 0) + 1)
    }
  }

  // Collect all relevant seller IDs
  const allSellerIds = new Set<string>([
    ...sellerActivities.keys(),
    ...sellerNextActions.keys(),
    ...sellerAdvances.keys(),
    ...sellerTotalLeads.keys(),
  ])

  // If non-admin, ensure current user is included even with no data
  if (!isAdmin && currentUserId) {
    allSellerIds.add(currentUserId)
  }

  const scores: SellerScore[] = []

  for (const sellerId of allSellerIds) {
    if (!isAdmin && sellerId !== currentUserId) continue
    if (isAdmin && selectedSellerId && sellerId !== selectedSellerId) continue
    if (!sellerNameMap.has(sellerId)) continue

    const sellerName = sellerNameMap.get(sellerId)!
    const activities = sellerActivities.get(sellerId) ?? 0
    const daysWithActivity = sellerActivityDates.get(sellerId)?.size ?? 0
    const nextActions = sellerNextActions.get(sellerId) ?? 0
    const overdueNextActions = sellerOverdue.get(sellerId) ?? 0
    const advances = sellerAdvances.get(sellerId) ?? 0
    const uniqueCycles = sellerCycles.get(sellerId)?.size ?? 0
    const totalActiveLeads = sellerTotalLeads.get(sellerId) ?? 0
    const staleLeads = sellerStaleLeads.get(sellerId) ?? 0
    const leadsWithoutNextAction = sellerLeadsWithoutNextAction.get(sellerId) ?? 0

    const dim1 = computeDim1(activities, daysWithActivity, workingDays)
    const dim2 = computeDim2(activities, nextActions, overdueNextActions)
    const dim3 = computeDim3(totalActiveLeads, staleLeads, leadsWithoutNextAction)
    const dim4 = computeDim4(activities, advances, uniqueCycles)

    const score = Math.round((dim1 + dim2 + dim3 + dim4) / 4)
    const classification = scoreClassification(score)

    const dims = [dim1, dim2, dim3, dim4]
    const strongDimIdx = dims.indexOf(Math.max(...dims))
    const weakDimIdx = dims.indexOf(Math.min(...dims))

    scores.push({
      sellerId,
      sellerName,
      initials: getInitials(sellerName),
      activities,
      daysWithActivity,
      workingDays,
      nextActions,
      overdueNextActions,
      advances,
      uniqueCycles,
      totalActiveLeads,
      staleLeads,
      leadsWithoutNextAction,
      dim1,
      dim2,
      dim3,
      dim4,
      score,
      classification,
      strongDimIdx,
      weakDimIdx,
    })
  }

  scores.sort((a, b) => b.score - a.score)
  return scores
}

// ============================================================================
// SVG Icons
// ============================================================================

function IconShieldCheck() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.35C17.25 22.15 21 17.25 21 12V7l-9-5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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

function IconTrendUp() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 6 23 6 23 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconTrendDown() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="17 18 23 18 23 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconAlertTriangle() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconTarget() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
    </svg>
  )
}

function IconSort() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 3l5 5 5-5M7 21l5-5 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconSortDown() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 21l5-5 5 5" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 3l5 5 5-5" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconSortUp() {
  return (
    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 3l5 5 5-5" stroke={ACCENT} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 21l5-5 5 5" stroke="#333" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ============================================================================
// Sub-navigation
// ============================================================================

const SUBNAV_TABS = [
  { label: 'Score de Aderência', href: null }, // active page
]

// ============================================================================
// Sub-components
// ============================================================================

function ScoreBar({ value, color }: { value: number; color: string }) {
  return (
    <div
      style={{
        width: 80,
        height: 5,
        background: '#1e1e1e',
        borderRadius: 99,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: `${clamp(value, 0, 100)}%`,
          height: '100%',
          background: color,
          borderRadius: 99,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  )
}

function DimMiniBar({ value }: { value: number }) {
  const color =
    value >= SCORE_SAUDAVEL ? '#34d399' : value >= SCORE_ATENCAO ? '#fbbf24' : '#f87171'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-end' }}>
      <span style={{ fontSize: 12, fontWeight: 600, color, minWidth: 28, textAlign: 'right' }}>
        {value}
      </span>
      <ScoreBar value={value} color={color} />
    </div>
  )
}

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
        border: '1px solid #1a1a1a',
        borderRadius: 12,
        padding: '20px 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: '#444',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
        }}
      >
        {icon && (
          <span style={{ color: accent ?? '#555', opacity: 0.8, flexShrink: 0 }}>{icon}</span>
        )}
        {label}
      </div>
      <div
        style={{
          fontSize: 30,
          fontWeight: 700,
          color: accent ?? 'white',
          lineHeight: 1,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: '#3a3a3a', lineHeight: 1.4 }}>{sub}</div>
      )}
    </div>
  )
}

function SortIndicator({
  active,
  dir,
}: {
  active: boolean
  dir: 'asc' | 'desc'
}) {
  if (!active) return <span style={{ opacity: 0.25 }}><IconSort /></span>
  if (dir === 'desc') return <IconSortDown />
  return <IconSortUp />
}

function ThCell({
  label,
  sortKey,
  currentKey,
  currentDir,
  onSort,
  align = 'right',
  minWidth,
}: {
  label: string
  sortKey: SortKey
  currentKey: SortKey
  currentDir: 'asc' | 'desc'
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
  minWidth?: number
}) {
  const active = currentKey === sortKey
  return (
    <th
      style={{
        padding: '10px 12px',
        textAlign: align,
        fontWeight: 600,
        fontSize: 11,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: active ? ACCENT : '#555',
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        minWidth,
        userSelect: 'none',
      }}
      onClick={() => onSort(sortKey)}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          justifyContent: align === 'right' ? 'flex-end' : 'flex-start',
        }}
      >
        {label}
        <SortIndicator active={active} dir={currentDir} />
      </span>
    </th>
  )
}

// ============================================================================
// Ranking row
// ============================================================================

function ConsultantRow({
  rank,
  row,
}: {
  rank: number
  row: SellerScore
}) {
  const [expanded, setExpanded] = React.useState(false)
  const clsColor = classificationColor(row.classification)
  const clsLabel = classificationLabel(row.classification)
  const clsBg = classificationBg(row.classification)

  const dims = [row.dim1, row.dim2, row.dim3, row.dim4]

  return (
    <>
      <tr
        style={{
          borderBottom: '1px solid #141414',
          cursor: 'pointer',
          transition: 'background 0.12s',
        }}
        onMouseOver={(e) => (e.currentTarget.style.background = '#111')}
        onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
        onClick={() => setExpanded((v) => !v)}
      >
        {/* Rank */}
        <td style={{ padding: '12px 14px', textAlign: 'right', width: 40 }}>
          <span style={{ fontSize: 12, color: '#3a3a3a', fontVariantNumeric: 'tabular-nums' }}>
            {rank}
          </span>
        </td>

        {/* Consultant */}
        <td style={{ padding: '12px 14px', minWidth: 180 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: '#1a1a1a',
                border: '1px solid #222',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: '#666',
                flexShrink: 0,
                letterSpacing: '0.02em',
              }}
            >
              {row.initials}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'white', lineHeight: 1.2 }}>
                {row.sellerName}
              </div>
              <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>
                {row.activities} atividades · {row.uniqueCycles} leads
              </div>
            </div>
          </div>
        </td>

        {/* Score total */}
        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <div
              style={{
                width: 72,
                height: 4,
                background: '#1e1e1e',
                borderRadius: 99,
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: `${row.score}%`,
                  height: '100%',
                  background: clsColor,
                  borderRadius: 99,
                }}
              />
            </div>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: clsColor,
                minWidth: 34,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {row.score}
            </span>
          </div>
        </td>

        {/* Classification */}
        <td style={{ padding: '12px 14px', textAlign: 'right' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 11,
              fontWeight: 600,
              color: clsColor,
              background: clsBg,
              border: `1px solid ${clsColor}22`,
              borderRadius: 5,
              padding: '3px 8px',
              letterSpacing: '0.03em',
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: clsColor,
                flexShrink: 0,
              }}
            />
            {clsLabel}
          </span>
        </td>

        {/* Dim 1–4 mini bars */}
        {dims.map((d, i) => (
          <td key={i} style={{ padding: '12px 14px', textAlign: 'right' }}>
            <DimMiniBar value={d} />
          </td>
        ))}

        {/* Strong / Weak */}
        <td style={{ padding: '12px 14px', textAlign: 'left', minWidth: 130 }}>
          <div style={{ fontSize: 11, lineHeight: 1.55 }}>
            <span style={{ color: '#34d399' }}>
              + {DIM_LABELS[row.strongDimIdx]}
            </span>
            <br />
            <span style={{ color: '#f87171' }}>
              — {DIM_LABELS[row.weakDimIdx]}
            </span>
          </div>
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr style={{ background: '#0c0c0c' }}>
          <td />
          <td colSpan={8} style={{ padding: '0 14px 14px 14px' }}>
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #1c1c1c',
                borderRadius: 8,
                padding: '14px 18px',
                display: 'grid',
                gridTemplateColumns: 'repeat(4, 1fr)',
                gap: 16,
              }}
            >
              {/* Dim 1 detail */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#555',
                    marginBottom: 8,
                  }}
                >
                  Registro de Atividades
                </div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.8 }}>
                  <div>Atividades: <span style={{ color: '#aaa' }}>{row.activities}</span></div>
                  <div>
                    Dias ativos:{' '}
                    <span style={{ color: '#aaa' }}>
                      {row.daysWithActivity} / {row.workingDays} úteis
                    </span>
                  </div>
                  <div>
                    Frequência:{' '}
                    <span style={{ color: '#aaa' }}>
                      {row.workingDays > 0
                        ? Math.round((row.daysWithActivity / row.workingDays) * 100)
                        : 0}%
                    </span>
                  </div>
                </div>
              </div>
              {/* Dim 2 detail */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#555',
                    marginBottom: 8,
                  }}
                >
                  Disciplina de Agenda
                </div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.8 }}>
                  <div>
                    Próximas ações:{' '}
                    <span style={{ color: '#aaa' }}>{row.nextActions}</span>
                  </div>
                  <div>
                    Disciplina:{' '}
                    <span style={{ color: '#aaa' }}>
                      {row.activities > 0
                        ? Math.round((row.nextActions / row.activities) * 100)
                        : 0}%
                    </span>
                  </div>
                  <div>
                    Vencidas:{' '}
                    <span
                      style={{
                        color: row.overdueNextActions > 0 ? '#f87171' : '#aaa',
                      }}
                    >
                      {row.overdueNextActions}
                    </span>
                  </div>
                </div>
              </div>
              {/* Dim 3 detail */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#555',
                    marginBottom: 8,
                  }}
                >
                  Saúde da Carteira
                </div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.8 }}>
                  <div>
                    Leads ativos:{' '}
                    <span style={{ color: '#aaa' }}>{row.totalActiveLeads}</span>
                  </div>
                  <div>
                    Parados {'>'}{STALE_DAYS}d:{' '}
                    <span
                      style={{
                        color: row.staleLeads > 0 ? '#f87171' : '#aaa',
                      }}
                    >
                      {row.staleLeads}
                    </span>
                  </div>
                  <div>
                    Sem próx. ação:{' '}
                    <span
                      style={{
                        color: row.leadsWithoutNextAction > 0 ? '#fbbf24' : '#aaa',
                      }}
                    >
                      {row.leadsWithoutNextAction}
                    </span>
                  </div>
                </div>
              </div>
              {/* Dim 4 detail */}
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: '#555',
                    marginBottom: 8,
                  }}
                >
                  Aderência ao Processo
                </div>
                <div style={{ fontSize: 11, color: '#666', lineHeight: 1.8 }}>
                  <div>
                    Avanços de etapa:{' '}
                    <span style={{ color: '#aaa' }}>{row.advances}</span>
                  </div>
                  <div>
                    Leads trabalhados:{' '}
                    <span style={{ color: '#aaa' }}>{row.uniqueCycles}</span>
                  </div>
                  <div>
                    Ativ. por lead:{' '}
                    <span style={{ color: '#aaa' }}>
                      {row.uniqueCycles > 0
                        ? (row.activities / row.uniqueCycles).toFixed(1)
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function ScoreAderenciaPage() {
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

  // Data
  const [scores, setScores] = React.useState<SellerScore[]>([])
  const [dataLoading, setDataLoading] = React.useState(false)

  // Sort
  const [sortKey, setSortKey] = React.useState<SortKey>('score')
  const [sortDir, setSortDir] = React.useState<'asc' | 'desc'>('desc')

  // ============================================================================
  // Init — auth + profile
  // ============================================================================
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

  // ============================================================================
  // Load data
  // ============================================================================
  React.useEffect(() => {
    if (!companyId) return
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, dateStart, dateEnd, selectedSellerId, isAdmin, currentUserId])

  async function loadData() {
    if (!companyId) return
    setDataLoading(true)
    try {
      // 1. Fetch all cycle events (paginated)
      const events = await fetchAllCycleEvents(supabase, {
        companyId,
        dateStart,
        dateEnd,
        columns: 'id, cycle_id, event_type, metadata, occurred_at, created_by',
      })

      // 2. Fetch active portfolio cycles (current state — not date filtered)
      const { data: activeCyclesData } = await supabase
        .from('sales_cycles')
        .select('owner_user_id, status, updated_at, next_action_date, next_action_at')
        .eq('company_id', companyId)
        .not('status', 'in', '("ganho","perdido")')

      // 3. Build member IDs set for attribution fallback
      const memberIds = new Set<string>(sellers.map((s) => s.id))
      if (!isAdmin && currentUserId) memberIds.add(currentUserId)

      const todayStr = getTodayDate()

      const result = buildAdherenceScores(
        (events ?? []) as RawEvent[],
        (activeCyclesData ?? []) as RawCycle[],
        sellers,
        dateStart,
        dateEnd,
        isAdmin,
        currentUserId,
        selectedSellerId,
        memberIds,
        todayStr,
      )

      setScores(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
    } finally {
      setDataLoading(false)
    }
  }

  // ============================================================================
  // Derived summary data
  // ============================================================================
  const sortedScores = React.useMemo(() => {
    const copy = [...scores]
    copy.sort((a, b) => {
      let va: number | string
      let vb: number | string
      if (sortKey === 'name') { va = a.sellerName; vb = b.sellerName }
      else if (sortKey === 'score') { va = a.score; vb = b.score }
      else if (sortKey === 'dim1') { va = a.dim1; vb = b.dim1 }
      else if (sortKey === 'dim2') { va = a.dim2; vb = b.dim2 }
      else if (sortKey === 'dim3') { va = a.dim3; vb = b.dim3 }
      else { va = a.dim4; vb = b.dim4 }

      if (typeof va === 'string' && typeof vb === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      }
      return sortDir === 'asc'
        ? (va as number) - (vb as number)
        : (vb as number) - (va as number)
    })
    return copy
  }, [scores, sortKey, sortDir])

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const avgScore =
    scores.length > 0 ? Math.round(scores.reduce((s, r) => s + r.score, 0) / scores.length) : null

  const topConsultant = scores.length > 0 ? scores[0] : null
  const bottomConsultant = scores.length > 1 ? scores[scores.length - 1] : null

  const pctSaudavel =
    scores.length > 0
      ? Math.round((scores.filter((r) => r.classification === 'saudavel').length / scores.length) * 100)
      : null

  // Main bottleneck: dimension with lowest average score
  const dimAvgs =
    scores.length > 0
      ? [0, 1, 2, 3].map((i) => {
          const vals = [
            scores.map((r) => r.dim1),
            scores.map((r) => r.dim2),
            scores.map((r) => r.dim3),
            scores.map((r) => r.dim4),
          ][i]
          return vals.reduce((s, v) => s + v, 0) / vals.length
        })
      : null

  const bottleneckDimIdx =
    dimAvgs ? dimAvgs.indexOf(Math.min(...dimAvgs)) : null

  // ============================================================================
  // Loading / Error states
  // ============================================================================
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

  const hasData = scores.length > 0

  // ============================================================================
  // Render
  // ============================================================================
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
              <IconShieldCheck />
            </span>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Score de Aderência Operacional
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Medição do uso disciplinado e correto do sistema por consultor — 4 dimensões, score 0 a 100
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
                  fontWeight: 500,
                  color: '#666',
                  textDecoration: 'none',
                  marginBottom: -1,
                  transition: 'color 0.12s, border-color 0.12s',
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#ccc'
                  e.currentTarget.style.borderBottomColor = '#333'
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = '#666'
                  e.currentTarget.style.borderBottomColor = 'transparent'
                }}
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
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 32,
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#555', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Período
            </span>
            <input
              type="date"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
              style={{
                background: '#111',
                border: '1px solid #1e1e1e',
                borderRadius: 6,
                color: '#ccc',
                fontSize: 12,
                padding: '5px 8px',
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 12, color: '#333' }}>—</span>
            <input
              type="date"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
              style={{
                background: '#111',
                border: '1px solid #1e1e1e',
                borderRadius: 6,
                color: '#ccc',
                fontSize: 12,
                padding: '5px 8px',
                outline: 'none',
              }}
            />
          </div>

          {isAdmin && sellers.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: 11,
                  color: '#555',
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                }}
              >
                Consultor
              </span>
              <select
                value={selectedSellerId ?? ''}
                onChange={(e) => setSelectedSellerId(e.target.value || null)}
                style={{
                  background: '#111',
                  border: '1px solid #1e1e1e',
                  borderRadius: 6,
                  color: '#ccc',
                  fontSize: 12,
                  padding: '5px 8px',
                  outline: 'none',
                }}
              >
                <option value="">Todos</option>
                {sellers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name ?? s.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {dataLoading && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 12,
                color: '#555',
              }}
            >
              <IconLoader />
              Calculando...
            </div>
          )}
        </div>

        {/* ── BLOCO 1: Resumo Executivo ── */}
        {hasData && (
          <div style={{ marginBottom: 36 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#444',
                marginBottom: 14,
              }}
            >
              Resumo do Período
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {topConsultant && (
                <SummaryCard
                  label="Maior Aderência"
                  value={topConsultant.score}
                  sub={topConsultant.sellerName}
                  accent="#34d399"
                  icon={<IconTrendUp />}
                />
              )}
              {bottomConsultant && (
                <SummaryCard
                  label="Menor Aderência"
                  value={bottomConsultant.score}
                  sub={bottomConsultant.sellerName}
                  accent="#f87171"
                  icon={<IconTrendDown />}
                />
              )}
              {avgScore !== null && (
                <SummaryCard
                  label="Média do Time"
                  value={avgScore}
                  sub={
                    avgScore >= SCORE_SAUDAVEL
                      ? 'Nível saudável'
                      : avgScore >= SCORE_ATENCAO
                        ? 'Nível atenção'
                        : 'Nível crítico'
                  }
                  accent={
                    avgScore >= SCORE_SAUDAVEL
                      ? '#34d399'
                      : avgScore >= SCORE_ATENCAO
                        ? '#fbbf24'
                        : '#f87171'
                  }
                  icon={<IconUsers />}
                />
              )}
              {bottleneckDimIdx !== null && dimAvgs && (
                <SummaryCard
                  label="Principal Gargalo"
                  value={DIM_LABELS[bottleneckDimIdx]}
                  sub={`Média: ${Math.round(dimAvgs[bottleneckDimIdx])} pts`}
                  accent="#fbbf24"
                  icon={<IconAlertTriangle />}
                />
              )}
              {pctSaudavel !== null && (
                <SummaryCard
                  label="Time em Nível Saudável"
                  value={`${pctSaudavel}%`}
                  sub={`${scores.filter((r) => r.classification === 'saudavel').length} de ${scores.length} consultores`}
                  accent={pctSaudavel >= 70 ? '#34d399' : pctSaudavel >= 40 ? '#fbbf24' : '#f87171'}
                  icon={<IconTarget />}
                />
              )}
            </div>
          </div>
        )}

        {/* ── BLOCO 2: Ranking ── */}
        <div style={{ marginBottom: 36 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: '#444',
              }}
            >
              Ranking de Aderência
            </span>
            {hasData && (
              <span style={{ fontSize: 11, color: '#3a3a3a' }}>
                {scores.length} consultor{scores.length !== 1 ? 'es' : ''}
              </span>
            )}
          </div>

          {!hasData && !dataLoading ? (
            <div
              style={{
                background: '#0f0f0f',
                border: '1px solid #1a1a1a',
                borderRadius: 12,
                padding: '40px 24px',
                textAlign: 'center',
                color: '#444',
                fontSize: 13,
              }}
            >
              Nenhum dado encontrado para o período e filtros selecionados.
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
              <div style={{ overflowX: 'auto' }}>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <th
                        style={{
                          padding: '10px 14px',
                          textAlign: 'right',
                          width: 40,
                          fontSize: 10,
                          fontWeight: 600,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: '#444',
                        }}
                      >
                        #
                      </th>
                      <ThCell
                        label="Consultor"
                        sortKey="name"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        align="left"
                        minWidth={180}
                      />
                      <ThCell
                        label="Score"
                        sortKey="score"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        minWidth={140}
                      />
                      <th
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: '#555',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Nível
                      </th>
                      <ThCell
                        label="Registro"
                        sortKey="dim1"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        minWidth={90}
                      />
                      <ThCell
                        label="Agenda"
                        sortKey="dim2"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        minWidth={90}
                      />
                      <ThCell
                        label="Carteira"
                        sortKey="dim3"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        minWidth={90}
                      />
                      <ThCell
                        label="Aderência"
                        sortKey="dim4"
                        currentKey={sortKey}
                        currentDir={sortDir}
                        onSort={handleSort}
                        minWidth={90}
                      />
                      <th
                        style={{
                          padding: '10px 12px',
                          textAlign: 'left',
                          fontWeight: 600,
                          fontSize: 11,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: '#555',
                          whiteSpace: 'nowrap',
                          minWidth: 130,
                        }}
                      >
                        Destaques
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedScores.map((row, idx) => (
                      <ConsultantRow key={row.sellerId} rank={idx + 1} row={row} />
                    ))}
                  </tbody>
                </table>
              </div>
              {hasData && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderTop: '1px solid #141414',
                    fontSize: 11,
                    color: '#3a3a3a',
                  }}
                >
                  Clique em um consultor para expandir o detalhe por dimensão.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── BLOCO 3: Legenda das Dimensões ── */}
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: '#444',
              marginBottom: 14,
            }}
          >
            Como o Score é Calculado
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: 10,
              marginBottom: 20,
            }}
          >
            {[
              {
                title: 'Registro de Atividades',
                pct: '25%',
                desc: 'Volume de atividades registradas no período e frequência de uso por dia útil. Consultores sem registro ou com presença irregular recebem nota baixa.',
                detail: '60 pts pelo volume (ref: 2 ativ./dia), 40 pts pela frequência (dias com ≥1 registro).',
              },
              {
                title: 'Disciplina de Próxima Ação',
                pct: '25%',
                desc: 'Proporção de atividades seguidas por um compromisso de próxima ação. Penaliza agenda vencida — o planejamento que não foi executado.',
                detail: 'Base: próximas ações / atividades × 100. Penalidade: vencidas / próximas ações × 50 pts.',
              },
              {
                title: 'Saúde da Carteira',
                pct: '25%',
                desc: 'Estado atual dos leads ativos do consultor: há leads parados há mais de ' + STALE_DAYS + ' dias? Há leads sem nenhuma próxima ação definida?',
                detail: '70 pts pela atualidade dos leads, 30 pts pelo comprometimento de agenda.',
              },
              {
                title: 'Aderência ao Processo',
                pct: '25%',
                desc: 'Relação entre atividades documentadas e leads trabalhados. Mede uso real vs clique superficial: avançar etapas sem registrar atividades é penalizado.',
                detail: '80 pts pelo volume por lead (ref: 3 ativ./lead), 20 pts por avanços proporcionais.',
              },
            ].map(({ title, pct, desc, detail }) => (
              <div
                key={title}
                style={{
                  background: '#0f0f0f',
                  border: '1px solid #1a1a1a',
                  borderRadius: 10,
                  padding: '16px 18px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#ccc' }}>{title}</span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: ACCENT,
                      background: 'rgba(56,189,248,0.07)',
                      border: `1px solid ${ACCENT}22`,
                      borderRadius: 4,
                      padding: '2px 7px',
                    }}
                  >
                    {pct}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: '#555', margin: '0 0 8px', lineHeight: 1.6 }}>
                  {desc}
                </p>
                <p style={{ fontSize: 11, color: '#3a3a3a', margin: 0, lineHeight: 1.5 }}>
                  {detail}
                </p>
              </div>
            ))}
          </div>

          {/* Classification legend */}
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #1a1a1a',
              borderRadius: 10,
              padding: '16px 20px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 24,
              alignItems: 'center',
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#444',
              }}
            >
              Classificações
            </span>
            {(
              [
                {
                  c: 'saudavel' as const,
                  range: `Score ≥ ${SCORE_SAUDAVEL}`,
                  desc: 'Uso disciplinado e consistente do sistema',
                },
                {
                  c: 'atencao' as const,
                  range: `${SCORE_ATENCAO}–${SCORE_SAUDAVEL - 1}`,
                  desc: 'Uso irregular — pontos específicos a corrigir',
                },
                {
                  c: 'critico' as const,
                  range: `Score < ${SCORE_ATENCAO}`,
                  desc: 'Baixa disciplina operacional — intervenção necessária',
                },
              ] as const
            ).map(({ c, range, desc }) => (
              <div key={c} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: classificationColor(c),
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 13, fontWeight: 600, color: classificationColor(c) }}>
                  {classificationLabel(c)}
                </span>
                <span style={{ fontSize: 12, color: '#555' }}>
                  {range} — {desc}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
