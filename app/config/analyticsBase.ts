// ---------------------------------------------------------------------------
// analyticsBase.ts — Base analítica: AnalyticsEvent + normalizeEvent() (Fase 2.5)
//
// Fontes de verdade:
// - EventSource: valores padronizados para metadata.source
// - AnalyticsEvent: visão normalizada de qualquer evento para análise
// - normalizeEvent(): converte evento bruto → AnalyticsEvent com dimensões completas
// ---------------------------------------------------------------------------

import { classifyEvent, isRealStageMove } from '@/app/config/eventClassification'
import type { EventKind, ClassifiableEvent } from '@/app/config/eventClassification'
import { resolveActionId, findActionById, resolveActionLabel } from '@/app/config/stageActions'
import { getActionEffect } from '@/app/config/actionEffects'
import type { StageEffect } from '@/app/config/actionEffects'

// ---------------------------------------------------------------------------
// EventSource — valores padronizados para metadata.source
// ---------------------------------------------------------------------------

/**
 * Valores padronizados para o campo metadata.source.
 *
 * Usar sempre as constantes de EVENT_SOURCES ao inserir eventos no banco.
 * Retrocompatibilidade: eventos antigos sem source são aceitos pelo sistema
 * e exibidos com source: null na camada analítica.
 */
export type EventSource =
  | 'quick_action'      // ação rápida no kanban (QuickActionModal)
  | 'kanban_drag'       // arraste de card no kanban (KanbanBoard)
  | 'lead_detail'       // ação na página de detalhe do lead (LeadActions)
  | 'stage_checkpoint'  // movimentação com checkpoint de etapa (StageCheckpointModal)
  | 'cycle_create'      // criação de novo ciclo/lead
  | 'import'            // importação em massa (ImportExcelDialog)

/** Constantes de source para uso direto em metadata */
export const EVENT_SOURCES: Record<EventSource, EventSource> = {
  quick_action:     'quick_action',
  kanban_drag:      'kanban_drag',
  lead_detail:      'lead_detail',
  stage_checkpoint: 'stage_checkpoint',
  cycle_create:     'cycle_create',
  import:           'import',
}

/** Labels pt-BR para cada fonte de evento */
export const EVENT_SOURCE_LABELS: Record<EventSource, string> = {
  quick_action:     'Ação Rápida',
  kanban_drag:      'Kanban (arraste)',
  lead_detail:      'Detalhe do Lead',
  stage_checkpoint: 'Checkpoint de Etapa',
  cycle_create:     'Criação de Ciclo',
  import:           'Importação',
}

// ---------------------------------------------------------------------------
// RawEvent — estrutura mínima de evento bruto (cycle_events ou lead_events)
// ---------------------------------------------------------------------------

/**
 * Extensão de ClassifiableEvent com campos presentes tanto em cycle_events
 * quanto em lead_events, para uso por normalizeEvent().
 */
export interface RawEvent extends ClassifiableEvent {
  id?: string
  company_id?: string
  cycle_id?: string
  lead_id?: string
  /** Usuário que criou o evento (cycle_events) */
  created_by?: string
  /** Usuário que criou o evento (lead_events) */
  user_id?: string
  /** Timestamp do evento (cycle_events) */
  occurred_at?: string
  /** Timestamp do evento (lead_events) */
  created_at?: string
}

// ---------------------------------------------------------------------------
// AnalyticsEvent — visão normalizada de evento para análise operacional
// ---------------------------------------------------------------------------

/**
 * Representação analítica normalizada de qualquer evento do sistema.
 * Produzida por normalizeEvent() a partir de qualquer evento bruto.
 *
 * Cada campo corresponde a uma dimensão analítica definida em analyticsDimensions.ts.
 */
export interface AnalyticsEvent {
  // ── Identificação ──────────────────────────────────────────────────────────
  event_id: string | null
  company_id: string | null
  cycle_id: string | null
  lead_id: string | null
  /** Usuário que registrou o evento (created_by ou user_id) */
  actor_id: string | null
  occurred_at: string | null
  event_type: string

  // ── Classificação semântica ────────────────────────────────────────────────
  /** Tipo semântico: stage_move | activity | next_action | won | lost */
  event_kind: EventKind

  // ── Dimensões de etapa ────────────────────────────────────────────────────
  stage_from: string | null
  stage_to: string | null
  /** Etapa do lead no momento do evento (= stage_to se houver, senão stage_from) */
  stage_current: string | null
  /** Houve troca real de etapa (from_stage ≠ to_stage)? */
  is_real_stage_move: boolean

  // ── Dimensões de ação ─────────────────────────────────────────────────────
  /** ID normalizado da ação no catálogo (ex: 'novo_ligacao_feita'), null se não for ação do catálogo */
  action_key: string | null
  /** Rótulo comercial da ação (ex: 'Ligação feita') */
  action_label: string | null
  /** Etapa à qual a ação pertence no catálogo */
  action_stage: string | null
  /** Categoria: 'activity' | 'outcome' | null */
  action_category: 'activity' | 'outcome' | null

  // ── Dimensões de efeito ───────────────────────────────────────────────────
  /** 'keep' (mantém etapa) | 'suggest_advance' (sugere avançar) | null */
  event_effect: StageEffect | null
  can_lead_to_won: boolean
  can_lead_to_lost: boolean

  // ── Dimensões de próxima ação ─────────────────────────────────────────────
  next_action_key: string | null
  next_action_label: string | null
  next_action_date: string | null
  /** Evento define ou inclui uma próxima ação? */
  next_action_set: boolean

  // ── Dimensões de resultado ────────────────────────────────────────────────
  /** Detalhe operacional registrado pelo vendedor */
  result_detail: string | null
  win_reason: string | null
  lost_reason: string | null

  // ── Origem ────────────────────────────────────────────────────────────────
  /** Origem do evento (metadata.source) */
  source: string | null
  /** Canal de comunicação (whatsapp, copy, etc.) */
  channel: string | null

  // ── Metadata bruto ────────────────────────────────────────────────────────
  metadata: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// normalizeEvent — converte evento bruto em AnalyticsEvent
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

/**
 * Converte qualquer evento bruto (cycle_events ou lead_events) em um
 * AnalyticsEvent com todas as dimensões semânticas preenchidas.
 *
 * Compatível com eventos antigos: campos ausentes resultam em null.
 * Não lança exceções — campos não preenchidos ficam como null/false.
 */
export function normalizeEvent(raw: RawEvent): AnalyticsEvent {
  const meta = (raw.metadata ?? {}) as Record<string, unknown>

  // ── Classificação semântica ──────────────────────────────────────────────
  const eventKind = classifyEvent(raw)
  const realStageMove = isRealStageMove(raw)

  // ── Etapas ───────────────────────────────────────────────────────────────
  const stageFrom =
    str(raw.from_stage) || str(meta.from_status) || str(meta.from_stage) || null
  const stageTo =
    str(raw.to_stage) || str(meta.to_status) || str(meta.to_stage) || null
  const stageCurrent = stageTo || stageFrom || null

  // ── Ação — apenas para eventos que correspondem ao catálogo ──────────────
  const rawEventType = str(raw.event_type)
  const resolvedId = resolveActionId(rawEventType)
  const actionDef = findActionById(resolvedId)
  // action_key só é preenchido se a ação existe no catálogo
  const actionKey = actionDef ? resolvedId : null
  const actionLabel = actionDef
    ? (actionDef.label ?? resolveActionLabel(rawEventType) ?? null)
    : null

  // ── Efeito ───────────────────────────────────────────────────────────────
  const effect = actionKey ? getActionEffect(actionKey) : undefined

  // ── Próxima ação ─────────────────────────────────────────────────────────
  const nextActionKey =
    str(meta.next_action) || str(meta.next_action_key) || null
  const nextActionLabel =
    str(meta.next_action_label) ||
    (nextActionKey ? resolveActionLabel(nextActionKey) : null) ||
    null
  const nextActionDate = str(meta.next_action_date) || null
  const nextActionSet = eventKind === 'next_action' || !!nextActionKey

  // ── Resultado ────────────────────────────────────────────────────────────
  const resultDetail =
    str(meta.detail) || str(meta.result_detail) || str(meta.action_result) || null
  const winReason =
    str(meta.won_reason) || str(meta.win_reason) || null
  const lostReason =
    str(meta.loss_reason) || str(meta.lost_reason) || str(meta.reason) || null

  // ── Origem ───────────────────────────────────────────────────────────────
  const source = str(meta.source) || null
  const channel = str(meta.channel) || null

  // ── Actor ─────────────────────────────────────────────────────────────────
  const actorId = str(raw.created_by) || str(raw.user_id) || null

  return {
    event_id:    raw.id         ?? null,
    company_id:  raw.company_id ?? null,
    cycle_id:    raw.cycle_id   ?? null,
    lead_id:     raw.lead_id    ?? null,
    actor_id:    actorId,
    occurred_at: raw.occurred_at ?? raw.created_at ?? null,
    event_type:  rawEventType,

    event_kind:         eventKind,

    stage_from:         stageFrom,
    stage_to:           stageTo,
    stage_current:      stageCurrent,
    is_real_stage_move: realStageMove,

    action_key:      actionKey,
    action_label:    actionLabel,
    action_stage:    actionDef?.stage ?? null,
    action_category: actionDef?.category ?? null,

    event_effect:     effect?.stageEffect   ?? null,
    can_lead_to_won:  effect?.canLeadToWon  ?? false,
    can_lead_to_lost: effect?.canLeadToLost ?? false,

    next_action_key:   nextActionKey,
    next_action_label: nextActionLabel,
    next_action_date:  nextActionDate,
    next_action_set:   nextActionSet,

    result_detail: resultDetail,
    win_reason:    winReason,
    lost_reason:   lostReason,

    source,
    channel,

    metadata: meta,
  }
}
