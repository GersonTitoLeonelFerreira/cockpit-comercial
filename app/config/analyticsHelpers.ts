// ---------------------------------------------------------------------------
// analyticsHelpers.ts — Funções de agregação e filtro analítico (Fase 2.5)
//
// Helpers reutilizáveis para análise operacional de eventos normalizados.
// Todas as funções operam sobre arrays de AnalyticsEvent já normalizados
// por normalizeEvent() (analyticsBase.ts).
// ---------------------------------------------------------------------------

import type { AnalyticsEvent, RawEvent } from '@/app/config/analyticsBase'
import { normalizeEvent } from '@/app/config/analyticsBase'
import type { EventKind } from '@/app/config/eventClassification'
import { getStageLabel } from '@/app/config/stageActions'

// ---------------------------------------------------------------------------
// Normalização em lote
// ---------------------------------------------------------------------------

/** Normaliza um array de eventos brutos em AnalyticsEvents */
export function normalizeEvents(raws: RawEvent[]): AnalyticsEvent[] {
  return raws.map(normalizeEvent)
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

/** Filtra eventos pelo tipo semântico */
export function filterByKind(events: AnalyticsEvent[], kind: EventKind): AnalyticsEvent[] {
  return events.filter(e => e.event_kind === kind)
}

/** Retorna apenas movimentações reais de etapa (from_stage ≠ to_stage) */
export function filterRealStageMoves(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events.filter(e => e.is_real_stage_move)
}

/** Filtra eventos pela etapa atual do lead */
export function filterByStage(events: AnalyticsEvent[], stage: string): AnalyticsEvent[] {
  return events.filter(e => e.stage_current === stage)
}

/** Filtra eventos pelo valor de metadata.source */
export function filterBySource(events: AnalyticsEvent[], source: string): AnalyticsEvent[] {
  return events.filter(e => e.source === source)
}

/** Filtra eventos por chave de ação do catálogo */
export function filterByAction(events: AnalyticsEvent[], actionKey: string): AnalyticsEvent[] {
  return events.filter(e => e.action_key === actionKey)
}

/**
 * Filtra eventos por intervalo de datas (inclusive nos dois extremos).
 * Aceita Date ou string ISO 8601.
 */
export function filterByDateRange(
  events: AnalyticsEvent[],
  from: Date | string,
  to: Date | string
): AnalyticsEvent[] {
  const fromMs = new Date(from).getTime()
  const toMs   = new Date(to).getTime()
  return events.filter(e => {
    if (!e.occurred_at) return false
    const t = new Date(e.occurred_at).getTime()
    return t >= fromMs && t <= toMs
  })
}

/** Filtra apenas atividades comerciais */
export function filterActivities(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return filterByKind(events, 'activity')
}

/** Filtra atividades marcadas como possíveis precursoras de ganho */
export function filterCanLeadToWon(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events.filter(e => e.can_lead_to_won)
}

/** Filtra atividades marcadas como possíveis precursoras de perda */
export function filterCanLeadToLost(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events.filter(e => e.can_lead_to_lost)
}

/** Filtra apenas eventos onde uma próxima ação foi definida */
export function filterWithNextAction(events: AnalyticsEvent[]): AnalyticsEvent[] {
  return events.filter(e => e.next_action_set)
}

// ---------------------------------------------------------------------------
// Agregações
// ---------------------------------------------------------------------------

/**
 * Conta eventos agrupados por um campo string.
 * Retorna array { value, count } ordenado por contagem decrescente.
 */
export function countBy(
  events: AnalyticsEvent[],
  field: keyof AnalyticsEvent
): Array<{ value: string; count: number }> {
  const counts: Record<string, number> = {}
  for (const ev of events) {
    const v = String(ev[field] ?? '(sem valor)')
    counts[v] = (counts[v] ?? 0) + 1
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
}

/** Contagem de eventos por etapa atual */
export function countByStage(
  events: AnalyticsEvent[]
): Array<{ stage: string; label: string; count: number }> {
  return countBy(events, 'stage_current').map(({ value, count }) => ({
    stage: value,
    label: getStageLabel(value),
    count,
  }))
}

/** Contagem de eventos por tipo semântico */
export function countByKind(
  events: AnalyticsEvent[]
): Array<{ kind: EventKind | string; count: number }> {
  return countBy(events, 'event_kind').map(({ value, count }) => ({
    kind: value as EventKind,
    count,
  }))
}

/** Contagem de atividades por ação (com label) */
export function countByAction(
  events: AnalyticsEvent[]
): Array<{ actionKey: string; actionLabel: string; count: number }> {
  const activities = filterActivities(events)
  // pré-constrói mapa de action_key → action_label para evitar múltiplas buscas
  const labelMap: Record<string, string> = {}
  for (const ev of activities) {
    if (ev.action_key && !labelMap[ev.action_key]) {
      labelMap[ev.action_key] = ev.action_label ?? ev.action_key
    }
  }
  return countBy(activities, 'action_key').map(({ value, count }) => ({
    actionKey: value,
    actionLabel: labelMap[value] ?? value,
    count,
  }))
}

/** Contagem de perdas por motivo */
export function countByLostReason(
  events: AnalyticsEvent[]
): Array<{ reason: string; count: number }> {
  return countBy(filterByKind(events, 'lost'), 'lost_reason').map(({ value, count }) => ({
    reason: value,
    count,
  }))
}

/** Contagem de ganhos por motivo/contexto */
export function countByWinReason(
  events: AnalyticsEvent[]
): Array<{ reason: string; count: number }> {
  return countBy(filterByKind(events, 'won'), 'win_reason').map(({ value, count }) => ({
    reason: value,
    count,
  }))
}

/** Contagem de eventos por origem (source) */
export function countBySource(
  events: AnalyticsEvent[]
): Array<{ source: string; count: number }> {
  return countBy(events, 'source').map(({ value, count }) => ({
    source: value,
    count,
  }))
}

// ---------------------------------------------------------------------------
// Funções de evento mais recente
// ---------------------------------------------------------------------------

function latest(events: AnalyticsEvent[]): AnalyticsEvent | null {
  if (!events.length) return null
  return events.reduce((best, ev) => {
    const ta = ev.occurred_at ? new Date(ev.occurred_at).getTime() : 0
    const tb = best.occurred_at ? new Date(best.occurred_at).getTime() : 0
    return ta > tb ? ev : best
  })
}

/** Retorna o evento de movimentação real de etapa mais recente */
export function getLastStageMove(events: AnalyticsEvent[]): AnalyticsEvent | null {
  return latest(filterRealStageMoves(events))
}

/** Retorna a atividade comercial mais recente */
export function getLastActivity(events: AnalyticsEvent[]): AnalyticsEvent | null {
  return latest(filterActivities(events))
}

/** Retorna o evento de próxima ação mais recente */
export function getLastNextAction(events: AnalyticsEvent[]): AnalyticsEvent | null {
  return latest(filterByKind(events, 'next_action'))
}

/** Retorna o evento de ganho (deve haver no máximo um por ciclo) */
export function getWonEvent(events: AnalyticsEvent[]): AnalyticsEvent | null {
  return latest(filterByKind(events, 'won'))
}

/** Retorna o evento de perda (deve haver no máximo um por ciclo) */
export function getLostEvent(events: AnalyticsEvent[]): AnalyticsEvent | null {
  return latest(filterByKind(events, 'lost'))
}

// ---------------------------------------------------------------------------
// Sumário operacional
// ---------------------------------------------------------------------------

export interface OperationalSummary {
  totalEvents: number
  activityCount: number
  stageMoveCount: number
  lastActivity: AnalyticsEvent | null
  lastStageMove: AnalyticsEvent | null
  lastNextAction: AnalyticsEvent | null
  wonEvent: AnalyticsEvent | null
  lostEvent: AnalyticsEvent | null
  /** Top 5 ações mais frequentes */
  topActions: Array<{ actionKey: string; actionLabel: string; count: number }>
}

/**
 * Gera um sumário operacional a partir de um array de eventos normalizados.
 *
 * Útil para:
 * - Blocos de resumo operacional do lead/ciclo
 * - Contexto de retomada
 * - Alertas contextuais
 */
export function buildOperationalSummary(events: AnalyticsEvent[]): OperationalSummary {
  const activities = filterActivities(events)
  const stageMoves = filterRealStageMoves(events)

  return {
    totalEvents:    events.length,
    activityCount:  activities.length,
    stageMoveCount: stageMoves.length,
    lastActivity:   latest(activities),
    lastStageMove:  latest(stageMoves),
    lastNextAction: getLastNextAction(events),
    wonEvent:       getWonEvent(events),
    lostEvent:      getLostEvent(events),
    topActions:     countByAction(events).slice(0, 5),
  }
}
