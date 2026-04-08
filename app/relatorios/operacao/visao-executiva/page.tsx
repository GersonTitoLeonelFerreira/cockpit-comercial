'use client'

import * as React from 'react'
import { supabaseBrowser } from '@/app/lib/supabaseBrowser'
import { fetchAllCycleEvents } from '@/app/lib/supabasePaginatedFetch'
import { STAGE_LABELS } from '@/app/config/stageActions'
import { classifyEvent } from '@/app/config/eventClassification'
import {
  CHANNEL_LABELS,
  extractChannelFromEvent,
} from '@/app/config/channelNormalization'
import {
  extractActionFromEvent,
  resolveCheckpointData,
  resolveActionId,
  findActionById,
  getActionLabel,
} from '@/app/config/stageActions'

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

function fmtCurrency(n: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
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

interface StageBottleneck {
  stage: string
  stageLabel: string
  activities: number
  advances: number
  advanceRate: number
}

interface ActionLever {
  actionId: string
  actionLabel: string
  total: number
  advances: number
  advanceRate: number
}

interface ChannelStat {
  channel: string
  channelLabel: string
  total: number
  won: number
  lost: number
  winRate: number
  lossRate: number
}

interface ConsultantStat {
  sellerId: string
  sellerName: string
  activities: number
  nextActions: number
  disciplineRate: number
  won: number
  lost: number
  advances: number
  revenue: number
}

interface ObjectionStat {
  text: string
  total: number
}

interface ExecutiveData {
  // Panorama
  totalCycles: number
  totalActivities: number
  totalAdvances: number
  totalWon: number
  totalLost: number
  totalNextActions: number
  totalRevenue: number
  advanceRate: number
  winRate: number
  disciplineRate: number
  overdueNextActions: number
  // Bottlenecks
  stageBottleneck: StageBottleneck | null
  topObjection: ObjectionStat | null
  channelWithMostLoss: ChannelStat | null
  consultantLeastDiscipline: ConsultantStat | null
  // Levers
  topActionByAdvance: ActionLever | null
  topChannelByWin: ChannelStat | null
  topConsultantByEfficiency: ConsultantStat | null
  // Raw arrays for shortcuts
  stageStats: StageBottleneck[]
  channelStats: ChannelStat[]
  consultantStats: ConsultantStat[]
}

// ============================================================================
// Constants
// ============================================================================

const STAGE_ORDER = ['novo', 'contato', 'respondeu', 'negociacao'] as const
const ACCENT = '#38bdf8'
const OBJECTION_ACTION_ID = 'negociacao_objecao_registrada'

// ============================================================================
// Core analytics
// ============================================================================

function buildExecutiveData(
  events: RawEvent[],
  dateStart: string,
  dateEnd: string,
  selectedSellerId: string | null,
  isAdmin: boolean,
  currentUserId: string | null,
  stageFilter: string,
  sellerMap: Map<string, string>,
  revenueMap: Map<string, number>,
  todayStr: string,
): ExecutiveData {
  const rangeStart = `${dateStart}T00:00:00`
  const rangeEnd = `${dateEnd}T23:59:59`

  // Panorama accumulators
  const cycleSet = new Set<string>()
  let totalActivities = 0
  let totalAdvances = 0
  let totalWon = 0
  let totalLost = 0
  let totalNextActions = 0
  let overdueNextActions = 0

  // Per-stage: activities and advances
  const stageActivityMap = new Map<string, number>()
  const stageAdvanceMap = new Map<string, number>()

  // Per-channel: total, won, lost
  const channelTotalMap = new Map<string, number>()
  const channelWonMap = new Map<string, number>()
  const channelLostMap = new Map<string, number>()

  // Per-consultant: activities, next_actions, won, lost, advances
  const consultantActivitiesMap = new Map<string, number>()
  const consultantNextActionsMap = new Map<string, number>()
  const consultantWonMap = new Map<string, number>()
  const consultantLostMap = new Map<string, number>()
  const consultantAdvancesMap = new Map<string, number>()

  // Objections
  const objectionMap = new Map<string, number>()

  for (const ev of events) {
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue

    // Seller filter (in-memory)
    if (isAdmin && selectedSellerId) {
      if (ev.created_by !== selectedSellerId) continue
    } else if (!isAdmin && currentUserId) {
      if (ev.created_by !== currentUserId) continue
    }

    const meta = (ev.metadata ?? {}) as Record<string, unknown>
    const kind = classifyEvent(ev)
    const sellerId = ev.created_by ?? ''

    // Stage filter
    if (stageFilter) {
      const evStage = String(
        meta.from_status ?? meta.from_stage ?? meta.stage ?? meta.to_status ?? ''
      ).toLowerCase()
      if (evStage && evStage !== stageFilter) continue
    }

    // Track unique cycles
    if (ev.cycle_id) cycleSet.add(ev.cycle_id)

    if (kind === 'won') {
      totalWon++
      if (sellerId) {
        consultantWonMap.set(sellerId, (consultantWonMap.get(sellerId) ?? 0) + 1)
      }
      const channel = extractChannelFromEvent(meta) ?? 'Outro'
      channelWonMap.set(channel, (channelWonMap.get(channel) ?? 0) + 1)
      continue
    }

    if (kind === 'lost') {
      totalLost++
      if (sellerId) {
        consultantLostMap.set(sellerId, (consultantLostMap.get(sellerId) ?? 0) + 1)
      }
      const channel = extractChannelFromEvent(meta) ?? 'Outro'
      channelLostMap.set(channel, (channelLostMap.get(channel) ?? 0) + 1)
      continue
    }

    if (kind === 'next_action') {
      totalNextActions++
      if (sellerId) {
        consultantNextActionsMap.set(sellerId, (consultantNextActionsMap.get(sellerId) ?? 0) + 1)
      }
      // Check if overdue
      const dueDate = String(meta.due_date ?? meta.scheduled_at ?? meta.next_action_date ?? '').trim()
      if (dueDate && dueDate.slice(0, 10) < todayStr) {
        overdueNextActions++
      }
      continue
    }

    if (kind === 'stage_move') {
      totalAdvances++
      const toStage = String(
        meta.to_status ?? meta.to_stage ?? meta.stage ?? ''
      ).toLowerCase()
      const fromStage = String(
        meta.from_status ?? meta.from_stage ?? ''
      ).toLowerCase()
      const trackStage = fromStage || toStage || 'novo'
      stageAdvanceMap.set(trackStage, (stageAdvanceMap.get(trackStage) ?? 0) + 1)
      if (sellerId) {
        consultantAdvancesMap.set(sellerId, (consultantAdvancesMap.get(sellerId) ?? 0) + 1)
      }
      continue
    }

    // Activity
    totalActivities++
    if (sellerId) {
      consultantActivitiesMap.set(sellerId, (consultantActivitiesMap.get(sellerId) ?? 0) + 1)
    }

    const evStageKey = String(
      meta.from_status ?? meta.from_stage ?? meta.stage ?? meta.to_status ?? ''
    ).toLowerCase() || 'novo'
    stageActivityMap.set(evStageKey, (stageActivityMap.get(evStageKey) ?? 0) + 1)

    // Channel
    const channel = extractChannelFromEvent(meta) ?? 'Outro'
    channelTotalMap.set(channel, (channelTotalMap.get(channel) ?? 0) + 1)

    // Objection detection (same logic as objecoes-e-perdas)
    const cp = resolveCheckpointData(meta)
    const rawId = String(meta.action_id ?? meta.quick_action ?? ev.event_type ?? '').trim()
    const resolvedId = rawId ? resolveActionId(rawId) : ''
    const hasObjectionField = typeof meta.objection === 'string' && meta.objection.trim().length > 0
    const hasCheckpointObjection = cp.action_result === 'Objeção identificada'

    if (resolvedId === OBJECTION_ACTION_ID || hasObjectionField || hasCheckpointObjection) {
      const text = String(
        cp.result_detail ?? meta.result_detail ?? meta.objection ?? meta.detail ?? meta.details ?? ''
      ).trim() || 'Sem detalhe registrado'
      objectionMap.set(text, (objectionMap.get(text) ?? 0) + 1)
    }
  }

  // For action advance rate: track unique cycles where the action was registered
  // and whether those cycles also had a stage_move in the period.
  const actionCyclesWithAdvance = new Map<string, Set<string>>()
  const actionCyclesTotal = new Map<string, Set<string>>()

  // Single-pass per-cycle action tracking
  const cycleActions = new Map<string, Set<string>>()
  const cycleHasAdvance = new Set<string>()

  for (const ev of events) {
    if (!ev.cycle_id) continue
    if (ev.occurred_at < rangeStart || ev.occurred_at > rangeEnd) continue
    if (isAdmin && selectedSellerId && ev.created_by !== selectedSellerId) continue
    if (!isAdmin && currentUserId && ev.created_by !== currentUserId) continue

    const kind = classifyEvent(ev)
    if (kind === 'stage_move') {
      cycleHasAdvance.add(ev.cycle_id)
    } else if (kind === 'activity') {
      const actionId = extractActionFromEvent(ev)
      if (actionId) {
        if (!cycleActions.has(ev.cycle_id)) cycleActions.set(ev.cycle_id, new Set())
        cycleActions.get(ev.cycle_id)!.add(actionId)
      }
    }
  }

  // Build action advance tracking
  for (const [cycleId, actions] of cycleActions.entries()) {
    const hasAdvance = cycleHasAdvance.has(cycleId)
    for (const actionId of actions) {
      if (!actionCyclesTotal.has(actionId)) actionCyclesTotal.set(actionId, new Set())
      actionCyclesTotal.get(actionId)!.add(cycleId)
      if (hasAdvance) {
        if (!actionCyclesWithAdvance.has(actionId)) actionCyclesWithAdvance.set(actionId, new Set())
        actionCyclesWithAdvance.get(actionId)!.add(cycleId)
      }
    }
  }

  // Build stage bottleneck stats
  const stageStats: StageBottleneck[] = STAGE_ORDER.map((stage) => {
    const activities = stageActivityMap.get(stage) ?? 0
    const advances = stageAdvanceMap.get(stage) ?? 0
    return {
      stage,
      stageLabel: STAGE_LABELS[stage] ?? stage,
      activities,
      advances,
      advanceRate: safePct(advances, activities),
    }
  }).filter(s => s.activities > 0)

  const stageBottleneck = stageStats.length > 0
    ? stageStats.reduce((worst, s) =>
        s.advanceRate < worst.advanceRate ? s : worst, stageStats[0])
    : null

  // Build action levers (min 3 cycles)
  const actionLevers: ActionLever[] = []
  for (const [actionId, cycleSet2] of actionCyclesTotal.entries()) {
    if (cycleSet2.size < 3) continue
    const advancedCycles = actionCyclesWithAdvance.get(actionId)?.size ?? 0
    const advanceRate = safePct(advancedCycles, cycleSet2.size)
    const label = findActionById(actionId) ? getActionLabel(actionId) : actionId.replace(/_/g, ' ')
    actionLevers.push({
      actionId,
      actionLabel: label,
      total: cycleSet2.size,
      advances: advancedCycles,
      advanceRate,
    })
  }
  actionLevers.sort((a, b) => b.advanceRate - a.advanceRate)
  const topActionByAdvance = actionLevers.length > 0 ? actionLevers[0] : null

  // Build channel stats (include channels from won/lost events)
  const allChannels = new Set([
    ...channelTotalMap.keys(),
    ...channelWonMap.keys(),
    ...channelLostMap.keys(),
  ])
  const channelStats: ChannelStat[] = []
  for (const channel of allChannels) {
    const total = (channelTotalMap.get(channel) ?? 0) +
      (channelWonMap.get(channel) ?? 0) +
      (channelLostMap.get(channel) ?? 0)
    const won = channelWonMap.get(channel) ?? 0
    const lost = channelLostMap.get(channel) ?? 0
    const closedTotal = won + lost
    channelStats.push({
      channel,
      channelLabel: CHANNEL_LABELS[channel] ?? channel,
      total,
      won,
      lost,
      winRate: safePct(won, closedTotal),
      lossRate: safePct(lost, closedTotal),
    })
  }
  channelStats.sort((a, b) => b.total - a.total)

  // Channel with most loss (min 2 closures)
  const eligibleChannelsForLoss = channelStats.filter(c => (c.won + c.lost) >= 2)
  const channelWithMostLoss = eligibleChannelsForLoss.length > 0
    ? eligibleChannelsForLoss.reduce((worst, c) =>
        c.lossRate > worst.lossRate ? c : worst, eligibleChannelsForLoss[0])
    : null

  // Channel with best win rate (min 2 closures)
  const eligibleChannelsForWin = channelStats.filter(c => (c.won + c.lost) >= 2)
  const topChannelByWin = eligibleChannelsForWin.length > 0
    ? eligibleChannelsForWin.reduce((best, c) =>
        c.winRate > best.winRate ? c : best, eligibleChannelsForWin[0])
    : null

  // Build consultant stats
  const allConsultantIds = new Set([
    ...consultantActivitiesMap.keys(),
    ...consultantNextActionsMap.keys(),
    ...consultantWonMap.keys(),
    ...consultantLostMap.keys(),
    ...consultantAdvancesMap.keys(),
  ])
  const consultantStats: ConsultantStat[] = []
  for (const sellerId of allConsultantIds) {
    const activities = consultantActivitiesMap.get(sellerId) ?? 0
    const nextActions = consultantNextActionsMap.get(sellerId) ?? 0
    const won = consultantWonMap.get(sellerId) ?? 0
    const lost = consultantLostMap.get(sellerId) ?? 0
    const advances = consultantAdvancesMap.get(sellerId) ?? 0
    const revenue = revenueMap.get(sellerId) ?? 0
    const disciplineRate = safePct(nextActions, activities)
    const sellerName = sellerMap.get(sellerId) ?? sellerId.slice(0, 8)
    consultantStats.push({
      sellerId,
      sellerName,
      activities,
      nextActions,
      disciplineRate,
      won,
      lost,
      advances,
      revenue,
    })
  }
  consultantStats.sort((a, b) => b.activities - a.activities)

  // Consultant with least discipline (min 3 activities)
  const eligibleForDiscipline = consultantStats.filter(c => c.activities >= 3)
  const consultantLeastDiscipline = eligibleForDiscipline.length > 0
    ? eligibleForDiscipline.reduce((worst, c) =>
        c.disciplineRate < worst.disciplineRate ? c : worst, eligibleForDiscipline[0])
    : null

  // Consultant with best efficiency (revenue per activity, min 5 activities + 1 won)
  const eligibleForEfficiency = consultantStats.filter(c => c.activities >= 5 && c.won >= 1 && c.revenue > 0)
  const topConsultantByEfficiency = eligibleForEfficiency.length > 0
    ? eligibleForEfficiency.reduce((best, c) => {
        const effBest = best.activities > 0 ? best.revenue / best.activities : 0
        const effC = c.activities > 0 ? c.revenue / c.activities : 0
        return effC > effBest ? c : best
      }, eligibleForEfficiency[0])
    : null

  // Top objection
  const topObjection = objectionMap.size > 0
    ? Array.from(objectionMap.entries())
        .map(([text, total]) => ({ text, total }))
        .sort((a, b) => b.total - a.total)[0]
    : null

  // Panorama
  const totalRevenue = Array.from(revenueMap.values()).reduce((s, v) => s + v, 0)
  const overallAdvanceRate = safePct(totalAdvances, totalActivities + totalAdvances)
  const winRate = safePct(totalWon, totalWon + totalLost)
  const disciplineRate = safePct(totalNextActions, totalActivities)

  return {
    totalCycles: cycleSet.size,
    totalActivities,
    totalAdvances,
    totalWon,
    totalLost,
    totalNextActions,
    totalRevenue,
    advanceRate: overallAdvanceRate,
    winRate,
    disciplineRate,
    overdueNextActions,
    stageBottleneck,
    topObjection,
    channelWithMostLoss,
    consultantLeastDiscipline,
    topActionByAdvance,
    topChannelByWin,
    topConsultantByEfficiency,
    stageStats,
    channelStats,
    consultantStats,
  }
}

// ============================================================================
// SVG Icons
// ============================================================================

function IconGauge() {
  return (
    <svg width={20} height={20} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2a10 10 0 1 0 10 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 12l4.5-4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
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

function IconCircleCheck() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconCircleX() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconAlertTriangle() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconZap() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconDollarSign() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconTarget() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function IconUsers() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.6" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconShare2() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="5" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="6" cy="12" r="3" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="18" cy="19" r="3" stroke="currentColor" strokeWidth="1.6" />
      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function IconLayers() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2 2 7l10 5 10-5-10-5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M2 17l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2 12l10 5 10-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function IconListCheck() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M10 6H21M10 12H21M10 18H21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M3 6l1 1 2-2M3 12l1 1 2-2M3 18l1 1 2-2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ============================================================================
// Sub-navigation (shared across operational reports)
// ============================================================================

const SUBNAV_TABS = [
  { label: 'Visão Executiva', href: null }, // active page
  { label: 'Ações por Etapa', href: '/relatorios/operacao/acoes-por-etapa' },
  { label: 'Avanço por Ação', href: '/relatorios/operacao/avanco-por-acao' },
  { label: 'Objeções e Perdas', href: '/relatorios/operacao/objecoes-e-perdas' },
  { label: 'Próximas Ações', href: '/relatorios/operacao/proximas-acoes' },
  { label: 'Canais', href: '/relatorios/operacao/canais' },
  { label: 'Desempenho por Consultor', href: '/relatorios/operacao/desempenho-por-consultor' },
]

// ============================================================================
// Sub-components — redesigned
// ============================================================================

function KpiCard({
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
        padding: '20px 24px',
        background: '#0f0f0f',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#555',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 5,
          minHeight: 36,
        }}
      >
        {icon && <span style={{ color: accent ?? '#555', opacity: 0.75, flexShrink: 0, marginTop: 1 }}>{icon}</span>}
        {label}
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, color: accent ?? 'white', lineHeight: 1, marginBottom: 4 }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: '#3a3a3a', marginTop: 4, minHeight: 16 }}>
        {sub ?? ''}
      </div>
    </div>
  )
}

function DiagRow({
  icon,
  title,
  detail,
  accent,
  isLast,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  accent: string
  isLast?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: '13px 0',
        borderBottom: isLast ? 'none' : '1px solid #161616',
      }}
    >
      <span style={{ color: accent, flexShrink: 0, marginTop: 2, opacity: 0.85 }}>{icon}</span>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#e0e0e0', marginBottom: 3, lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#555', lineHeight: 1.5 }}>{detail}</div>
      </div>
    </div>
  )
}

type HealthStatus = 'green' | 'yellow' | 'red'

function HealthRow({
  label,
  value,
  detail,
  status,
  isLast,
}: {
  label: string
  value: string
  detail: string
  status: HealthStatus
  isLast?: boolean
}) {
  const dotColor = status === 'green' ? '#34d399' : status === 'yellow' ? '#fbbf24' : '#f87171'
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '13px 0',
        borderBottom: isLast ? 'none' : '1px solid #161616',
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
      <div style={{ flex: '0 0 190px', fontSize: 12, fontWeight: 600, color: '#666' }}>{label}</div>
      <div style={{ flex: '0 0 90px', fontSize: 18, fontWeight: 700, color: dotColor }}>{value}</div>
      <div style={{ fontSize: 12, color: '#444', lineHeight: 1.5 }}>{detail}</div>
    </div>
  )
}

function FocoCard({
  icon,
  tag,
  title,
  description,
  tagColor,
}: {
  icon: React.ReactNode
  tag: string
  title: string
  description: string
  tagColor: string
}) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 200,
        padding: '22px 24px',
        background: `${tagColor}0a`,
        border: `1px solid ${tagColor}22`,
        borderRadius: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ color: tagColor, opacity: 0.85 }}>{icon}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: tagColor,
            opacity: 0.85,
          }}
        >
          {tag}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 8, lineHeight: 1.3 }}>
        {title}
      </div>
      <div style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>{description}</div>
    </div>
  )
}

function NavLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '8px 14px',
        border: '1px solid #1e1e1e',
        borderRadius: 7,
        fontSize: 12,
        fontWeight: 500,
        color: '#777',
        textDecoration: 'none',
        transition: 'border-color 0.15s, color 0.15s',
      }}
      onMouseOver={(e) => {
        e.currentTarget.style.borderColor = '#2e2e2e'
        e.currentTarget.style.color = '#bbb'
      }}
      onMouseOut={(e) => {
        e.currentTarget.style.borderColor = '#1e1e1e'
        e.currentTarget.style.color = '#777'
      }}
    >
      <span style={{ color: '#444', flexShrink: 0 }}>{icon}</span>
      {label}
    </a>
  )
}

// ============================================================================
// Main Page
// ============================================================================

export default function VisaoExecutivaPage() {
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
  const [execData, setExecData] = React.useState<ExecutiveData | null>(null)
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
      // 1. Fetch all cycle events (paginated)
      const data = await fetchAllCycleEvents(supabase, {
        companyId,
        dateStart,
        dateEnd,
        columns: 'id, cycle_id, event_type, metadata, occurred_at, created_by',
      })

      // 2. Fetch revenue from sales_cycles
      const { data: wonCycles } = await supabase
        .from('sales_cycles')
        .select('won_total, won_owner_user_id')
        .eq('company_id', companyId)
        .eq('status', 'ganho')
        .gt('won_total', 0)
        .gte('won_at', `${dateStart}T00:00:00`)
        .lte('won_at', `${dateEnd}T23:59:59`)

      const revenueMap = new Map<string, number>()
      for (const cycle of (wonCycles ?? []) as Array<{ won_total: number; won_owner_user_id: string | null }>) {
        if (!cycle.won_owner_user_id) continue
        revenueMap.set(
          cycle.won_owner_user_id,
          (revenueMap.get(cycle.won_owner_user_id) ?? 0) + Number(cycle.won_total),
        )
      }

      // 3. Build seller name map
      const sellerMap = new Map<string, string>()
      for (const s of sellers) {
        if (s.full_name) sellerMap.set(s.id, s.full_name)
      }

      // If non-admin, also map current user
      if (!isAdmin && currentUserId) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('id', currentUserId)
          .maybeSingle()
        if (profileData?.full_name) sellerMap.set(currentUserId, profileData.full_name)
      }

      // Enrich seller map with any revenue owners not yet in sellers list
      const revenueOwnerIds = Array.from(revenueMap.keys()).filter(id => !sellerMap.has(id))
      if (revenueOwnerIds.length > 0) {
        const { data: extraProfiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', revenueOwnerIds)
        for (const p of (extraProfiles ?? []) as SellerOption[]) {
          if (p.full_name) sellerMap.set(p.id, p.full_name)
        }
      }

      const todayStr = getTodayDate()

      const result = buildExecutiveData(
        (data ?? []) as RawEvent[],
        dateStart,
        dateEnd,
        selectedSellerId,
        isAdmin,
        currentUserId,
        selectedStage,
        sellerMap,
        revenueMap,
        todayStr,
      )
      setExecData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erro ao carregar dados.')
    } finally {
      setDataLoading(false)
    }
  }

  // ==========================================================================
  // Health diagnoses (derived from data)
  // ==========================================================================
  function getAdvanceRateStatus(rate: number): HealthStatus {
    if (rate >= 30) return 'green'
    if (rate >= 15) return 'yellow'
    return 'red'
  }

  function getDisciplineStatus(rate: number): HealthStatus {
    if (rate >= 50) return 'green'
    if (rate >= 25) return 'yellow'
    return 'red'
  }

  function getOverdueStatus(overdue: number, total: number): HealthStatus {
    const pct = safePct(overdue, total)
    if (pct <= 20) return 'green'
    if (pct <= 50) return 'yellow'
    return 'red'
  }

  function getWinRateStatus(rate: number, totalClosed: number): HealthStatus {
    if (totalClosed === 0) return 'yellow'
    if (rate >= 30) return 'green'
    if (rate >= 15) return 'yellow'
    return 'red'
  }

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

  const d = execData
  const totalClosed = d ? d.totalWon + d.totalLost : 0
  const hasData = d && (d.totalActivities + d.totalAdvances + d.totalWon + d.totalLost) > 0

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
              <IconGauge />
            </span>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>
              Visão Executiva
            </h1>
          </div>
          <p style={{ fontSize: 13, color: '#555', margin: 0 }}>
            Síntese gerencial da operação — sinais, gargalos, alavancas e prioridades do período
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
            marginBottom: 40,
            padding: '16px 20px',
            background: '#0f0f0f',
            border: '1px solid #1a1a1a',
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

        {/* Empty state */}
        {!hasData && !dataLoading && (
          <div
            style={{
              background: '#0f0f0f',
              border: '1px solid #1a1a1a',
              borderRadius: 12,
              padding: '48px 32px',
              textAlign: 'center',
              color: '#555',
            }}
          >
            <div style={{ fontSize: 14, marginBottom: 6 }}>Nenhum evento encontrado no período selecionado.</div>
            <div style={{ fontSize: 12 }}>Ajuste o intervalo de datas ou os filtros.</div>
          </div>
        )}

        {d && hasData && (
          <>
            {/* ================================================================
                BLOCO 1 — PANORAMA DO PERÍODO
            ================================================================ */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#444', marginBottom: 14 }}>
                Panorama do Período
              </div>
              <div
                style={{
                  border: '1px solid #1a1a1a',
                  borderRadius: 12,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(0, 1fr))',
                  gap: '0 1px',
                  background: '#1a1a1a',
                  overflow: 'hidden',
                }}
              >
                <KpiCard
                  label="Leads trabalhados"
                  value={d.totalCycles}
                  sub="ciclos únicos"
                  accent={ACCENT}
                  icon={<IconUsers />}
                />
                <KpiCard
                  label="Avanços"
                  value={d.totalAdvances}
                  sub="movimentações de etapa"
                  accent="#60a5fa"
                  icon={<IconTrendUp />}
                />
                <KpiCard
                  label="Ganhos"
                  value={d.totalWon}
                  sub={totalClosed > 0 ? `${fmtPct(d.winRate)} de conversão` : 'sem fechamentos'}
                  accent="#34d399"
                  icon={<IconCircleCheck />}
                />
                <KpiCard
                  label="Perdas"
                  value={d.totalLost}
                  sub={totalClosed > 0 ? `${fmtPct(100 - d.winRate)} de perda` : 'sem fechamentos'}
                  accent="#f87171"
                  icon={<IconCircleX />}
                />
                {d.totalRevenue > 0 && (
                  <KpiCard
                    label="Faturamento"
                    value={fmtCurrency(d.totalRevenue)}
                    sub="ciclos ganhos"
                    accent="#fbbf24"
                    icon={<IconDollarSign />}
                  />
                )}
                {d.totalActivities > 0 && (
                  <KpiCard
                    label="Disciplina geral"
                    value={fmtPct(d.disciplineRate)}
                    sub="próx. ações / atividades"
                    accent={d.disciplineRate >= 50 ? '#34d399' : d.disciplineRate >= 25 ? '#fbbf24' : '#f87171'}
                    icon={<IconListCheck />}
                  />
                )}
              </div>
            </div>

            {/* ================================================================
                BLOCO 2 — DIAGNÓSTICO EXECUTIVO
            ================================================================ */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#444', marginBottom: 14 }}>
                Diagnóstico Executivo
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Coluna esquerda: Gargalos */}
                <div
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #1a1a1a',
                    borderRadius: 12,
                    padding: '20px 24px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <span style={{ color: '#f87171', opacity: 0.8 }}><IconAlertTriangle /></span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#ccc' }}>Maiores Gargalos</div>
                      <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>Pontos críticos identificados no período</div>
                    </div>
                  </div>
                  {d.stageBottleneck && (
                    <DiagRow
                      icon={<IconLayers />}
                      title={`Travamento em ${d.stageBottleneck.stageLabel}`}
                      detail={`${d.stageBottleneck.activities} atividades, apenas ${fmtPct(d.stageBottleneck.advanceRate)} de avanço`}
                      accent="#f87171"
                    />
                  )}
                  {d.overdueNextActions > 0 && d.totalNextActions > 0 && (
                    <DiagRow
                      icon={<IconAlertTriangle />}
                      title={`${d.overdueNextActions} ação${d.overdueNextActions === 1 ? '' : 'ões'} vencida${d.overdueNextActions === 1 ? '' : 's'}`}
                      detail={`${fmtPct(safePct(d.overdueNextActions, d.totalNextActions))} das próximas ações estão atrasadas`}
                      accent="#fb923c"
                    />
                  )}
                  {d.topObjection && (
                    <DiagRow
                      icon={<IconCircleX />}
                      title="Objeção mais frequente"
                      detail={`"${d.topObjection.text.length > 50 ? `${d.topObjection.text.slice(0, 50)}…` : d.topObjection.text}" — ${d.topObjection.total} ocorrência${d.topObjection.total === 1 ? '' : 's'}`}
                      accent="#fbbf24"
                    />
                  )}
                  {d.channelWithMostLoss && (d.channelWithMostLoss.won + d.channelWithMostLoss.lost) >= 2 && (
                    <DiagRow
                      icon={<IconShare2 />}
                      title={`Canal com mais perda: ${d.channelWithMostLoss.channelLabel}`}
                      detail={`${fmtPct(d.channelWithMostLoss.lossRate)} de perda · ${d.channelWithMostLoss.lost} de ${d.channelWithMostLoss.won + d.channelWithMostLoss.lost} fechamentos`}
                      accent="#f87171"
                    />
                  )}
                  {d.consultantLeastDiscipline && (
                    <DiagRow
                      icon={<IconUsers />}
                      title={`Menor disciplina: ${d.consultantLeastDiscipline.sellerName}`}
                      detail={`${fmtPct(d.consultantLeastDiscipline.disciplineRate)} de disciplina · ${d.consultantLeastDiscipline.activities} atividades`}
                      accent="#f472b6"
                      isLast
                    />
                  )}
                  {!(d.stageBottleneck || d.overdueNextActions > 0 || d.topObjection || d.channelWithMostLoss || d.consultantLeastDiscipline) && (
                    <div style={{ fontSize: 13, color: '#333', padding: '12px 0' }}>
                      Nenhum gargalo crítico identificado.
                    </div>
                  )}
                </div>

                {/* Coluna direita: Alavancas */}
                <div
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #1a1a1a',
                    borderRadius: 12,
                    padding: '20px 24px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
                    <span style={{ color: '#34d399', opacity: 0.8 }}><IconZap /></span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#ccc' }}>Maiores Alavancas</div>
                      <div style={{ fontSize: 11, color: '#444', marginTop: 1 }}>O que está funcionando bem no período</div>
                    </div>
                  </div>
                  {d.topActionByAdvance && (
                    <DiagRow
                      icon={<IconZap />}
                      title={`Ação com maior avanço: ${d.topActionByAdvance.actionLabel}`}
                      detail={`${fmtPct(d.topActionByAdvance.advanceRate)} de avanço · ${d.topActionByAdvance.total} ciclo${d.topActionByAdvance.total === 1 ? '' : 's'}`}
                      accent="#34d399"
                    />
                  )}
                  {d.topChannelByWin && (d.topChannelByWin.won + d.topChannelByWin.lost) >= 2 && (
                    <DiagRow
                      icon={<IconShare2 />}
                      title={`Canal que mais fecha: ${d.topChannelByWin.channelLabel}`}
                      detail={`${fmtPct(d.topChannelByWin.winRate)} de conversão · ${d.topChannelByWin.won} ganho${d.topChannelByWin.won === 1 ? '' : 's'}`}
                      accent="#60a5fa"
                    />
                  )}
                  {d.topConsultantByEfficiency && (
                    <DiagRow
                      icon={<IconUsers />}
                      title={`Consultor mais eficiente: ${d.topConsultantByEfficiency.sellerName}`}
                      detail={`${fmtCurrency(Math.round(d.topConsultantByEfficiency.revenue / d.topConsultantByEfficiency.activities))} por atividade · ${d.topConsultantByEfficiency.won} ganho${d.topConsultantByEfficiency.won === 1 ? '' : 's'}`}
                      accent="#fbbf24"
                    />
                  )}
                  {d.totalRevenue > 0 && totalClosed > 0 && (
                    <DiagRow
                      icon={<IconDollarSign />}
                      title={`Faturamento total: ${fmtCurrency(d.totalRevenue)}`}
                      detail={`${d.totalWon} fechamento${d.totalWon === 1 ? '' : 's'} · média ${fmtCurrency(Math.round(d.totalRevenue / d.totalWon))} por ganho`}
                      accent="#a78bfa"
                      isLast
                    />
                  )}
                  {!(d.topActionByAdvance || (d.topChannelByWin && (d.topChannelByWin.won + d.topChannelByWin.lost) >= 2) || d.topConsultantByEfficiency) && (
                    <div style={{ fontSize: 13, color: '#333', padding: '12px 0' }}>
                      Volume insuficiente para identificar alavancas.
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* ================================================================
                BLOCO 3 — SAÚDE DA OPERAÇÃO
            ================================================================ */}
            {(d.totalActivities > 0 || d.totalNextActions > 0 || totalClosed > 0) && (
              <div style={{ marginBottom: 40 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#444', marginBottom: 14 }}>
                  Saúde da Operação
                </div>
                <div
                  style={{
                    background: '#0f0f0f',
                    border: '1px solid #1a1a1a',
                    borderRadius: 12,
                    padding: '20px 24px',
                  }}
                >
                  {d.totalActivities > 0 && (
                    <HealthRow
                      label="Fluidez do funil"
                      value={fmtPct(d.advanceRate)}
                      detail={
                        d.advanceRate >= 30
                          ? 'Boa fluidez — avanços consistentes'
                          : d.advanceRate >= 15
                          ? 'Fluidez moderada — parte das atividades não converte'
                          : 'Baixa fluidez — leads travando no funil'
                      }
                      status={getAdvanceRateStatus(d.advanceRate)}
                    />
                  )}
                  {d.totalActivities > 0 && (
                    <HealthRow
                      label="Disciplina operacional"
                      value={fmtPct(d.disciplineRate)}
                      detail={
                        d.disciplineRate >= 50
                          ? 'Time registra próxima ação com regularidade'
                          : d.disciplineRate >= 25
                          ? 'Disciplina parcial — metade sem próxima ação'
                          : 'Baixa disciplina — operação sem agenda definida'
                      }
                      status={getDisciplineStatus(d.disciplineRate)}
                    />
                  )}
                  {d.totalNextActions > 0 && (
                    <HealthRow
                      label="Controle da agenda"
                      value={`${d.overdueNextActions} vencida${d.overdueNextActions === 1 ? '' : 's'}`}
                      detail={
                        safePct(d.overdueNextActions, d.totalNextActions) <= 20
                          ? `Agenda controlada — ${fmtPct(safePct(d.overdueNextActions, d.totalNextActions))} de atraso`
                          : safePct(d.overdueNextActions, d.totalNextActions) <= 50
                          ? `Atenção — ${fmtPct(safePct(d.overdueNextActions, d.totalNextActions))} das ações estão vencidas`
                          : `Agenda crítica — ${fmtPct(safePct(d.overdueNextActions, d.totalNextActions))} das ações estão vencidas`
                      }
                      status={getOverdueStatus(d.overdueNextActions, d.totalNextActions)}
                      isLast={totalClosed === 0}
                    />
                  )}
                  {totalClosed > 0 && (
                    <HealthRow
                      label="Eficácia em fechamento"
                      value={fmtPct(d.winRate)}
                      detail={
                        d.winRate >= 30
                          ? `${d.totalWon} de ${totalClosed} ganhos — boa conversão`
                          : d.winRate >= 15
                          ? `${d.totalWon} de ${totalClosed} ganhos — conversão moderada`
                          : `${d.totalWon} de ${totalClosed} ganhos — baixa conversão`
                      }
                      status={getWinRateStatus(d.winRate, totalClosed)}
                      isLast
                    />
                  )}
                </div>
              </div>
            )}

            {/* ================================================================
                BLOCO 4 — FOCO DO GESTOR
            ================================================================ */}
            {(d.stageBottleneck || d.topActionByAdvance || d.overdueNextActions > 0 || d.topChannelByWin) && (
              <div style={{ marginBottom: 40 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#444', marginBottom: 14 }}>
                  Foco do Gestor
                </div>
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

                  {/* Principal problema */}
                  {(d.stageBottleneck || d.overdueNextActions > 0) && (
                    <FocoCard
                      icon={<IconAlertTriangle />}
                      tag="Principal problema agora"
                      title={
                        d.overdueNextActions > 3
                          ? 'Agenda vencida sem ação'
                          : d.stageBottleneck
                          ? `Travamento na etapa ${d.stageBottleneck.stageLabel}`
                          : 'Agenda com atrasos'
                      }
                      description={
                        d.overdueNextActions > 3
                          ? `${d.overdueNextActions} próxima${d.overdueNextActions === 1 ? ' ação vencida' : 's ações vencidas'} — leads esperando sem seguimento ativo.`
                          : d.stageBottleneck
                          ? `${d.stageBottleneck.activities} atividades com apenas ${fmtPct(d.stageBottleneck.advanceRate)} de avanço. Revisar ações utilizadas nessa etapa.`
                          : `${d.overdueNextActions} ação${d.overdueNextActions === 1 ? '' : 'ões'} vencida${d.overdueNextActions === 1 ? '' : 's'} — priorizar atendimento.`
                      }
                      tagColor="#f87171"
                    />
                  )}

                  {/* Principal oportunidade */}
                  {(d.topActionByAdvance || d.topChannelByWin) && (
                    <FocoCard
                      icon={<IconZap />}
                      tag="Principal oportunidade agora"
                      title={
                        d.topActionByAdvance
                          ? `Replicar: ${d.topActionByAdvance.actionLabel}`
                          : `Priorizar canal: ${d.topChannelByWin?.channelLabel ?? ''}`
                      }
                      description={
                        d.topActionByAdvance
                          ? `${fmtPct(d.topActionByAdvance.advanceRate)} dos ciclos que usaram essa ação avançaram. Incentivar o time a aplicar mais essa abordagem.`
                          : `${fmtPct(d.topChannelByWin?.winRate ?? 0)} de conversão — melhor canal de fechamento no período.`
                      }
                      tagColor="#34d399"
                    />
                  )}

                  {/* Onde atacar */}
                  {d.consultantLeastDiscipline && d.topConsultantByEfficiency && (
                    <FocoCard
                      icon={<IconTarget />}
                      tag="Onde atacar primeiro"
                      title={`Coaching com ${d.consultantLeastDiscipline.sellerName}`}
                      description={`${fmtPct(d.consultantLeastDiscipline.disciplineRate)} de disciplina. Referência: ${d.topConsultantByEfficiency.sellerName} com maior eficiência por atividade.`}
                      tagColor="#fbbf24"
                    />
                  )}

                </div>
              </div>
            )}

            {/* ================================================================
                BLOCO 5 — APROFUNDAR ANÁLISE
            ================================================================ */}
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#333', marginBottom: 14 }}>
                Aprofundar Análise
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <NavLink href="/relatorios/operacao/acoes-por-etapa" icon={<IconLayers />} label="Ações por Etapa" />
                <NavLink href="/relatorios/operacao/avanco-por-acao" icon={<IconTrendUp />} label="Avanço por Ação" />
                <NavLink href="/relatorios/operacao/objecoes-e-perdas" icon={<IconAlertTriangle />} label="Objeções e Perdas" />
                <NavLink href="/relatorios/operacao/proximas-acoes" icon={<IconListCheck />} label="Próximas Ações" />
                <NavLink href="/relatorios/operacao/canais" icon={<IconShare2 />} label="Canais" />
                <NavLink href="/relatorios/operacao/desempenho-por-consultor" icon={<IconUsers />} label="Desempenho por Consultor" />
              </div>
            </div>

          </>
        )}
      </div>
    </div>
  )
}
