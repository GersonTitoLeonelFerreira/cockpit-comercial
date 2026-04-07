// ---------------------------------------------------------------------------
// eventClassification.ts — Classificação semântica de eventos (Fase 2.3)
//
// Define 5 categorias semânticas claras de evento e provê a função
// `classifyEvent()` que determina o tipo correto de qualquer evento
// registrado no banco (lead_events ou cycle_events), incluindo eventos
// antigos (retrocompatibilidade por inferência).
// ---------------------------------------------------------------------------

import { resolveActionId } from '@/app/config/stageActions'

// ---------------------------------------------------------------------------
// Tipo principal
// ---------------------------------------------------------------------------

/**
 * Categorias semânticas de evento:
 * - stage_move:   Movimentação real de etapa (from_stage ≠ to_stage)
 * - activity:     Atividade comercial (contato, ligação, proposta, etc.)
 * - next_action:  Definição/atualização de próxima ação
 * - won:          Fechamento como ganho
 * - lost:         Fechamento como perda
 */
export type EventKind =
  | 'stage_move'
  | 'activity'
  | 'next_action'
  | 'won'
  | 'lost'

// ---------------------------------------------------------------------------
// Interface mínima para classificação (compatível com lead_events e cycle_events)
// ---------------------------------------------------------------------------

export interface ClassifiableEvent {
  event_type: string
  from_stage?: string | null
  to_stage?: string | null
  metadata?: Record<string, unknown> | null
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function normalize(v: unknown): string {
  if (v == null) return ''
  return String(v).toLowerCase().trim()
}

function extractStages(event: ClassifiableEvent): { from: string; to: string } {
  const m = event.metadata ?? {}
  const from = normalize(event.from_stage) ||
    normalize(m.from_status) ||
    normalize(m.from_stage)
  const to = normalize(event.to_stage) ||
    normalize(m.to_status) ||
    normalize(m.to_stage)
  return { from, to }
}

// ---------------------------------------------------------------------------
// classifyEvent — determinístico, retrocompatível
// ---------------------------------------------------------------------------

/**
 * Classifica semanticamente um evento.
 *
 * Regra de ouro: se `from_stage === to_stage`, NUNCA retornar `stage_move`.
 *
 * Ordem de precedência:
 * 1. Tipos explícitos de ganho/perda (closed_won, closed_lost)
 * 2. Tipo next_action_set
 * 3. Destino ganho/perdido via to_stage
 * 4. event_type === 'stage_changed' + from ≠ to  → stage_move
 * 5. event_type === 'stage_changed' + from === to → activity (falsa transição)
 * 6. IDs de ação do catálogo (prefixo de etapa, legacy quick_, etc.) → activity
 * 7. Tipos de atividade explícitos (contacted, replied, note_added, etc.)
 * 8. Default → activity
 */
export function classifyEvent(event: ClassifiableEvent): EventKind {
  const et = event.event_type ?? ''
  const { from, to } = extractStages(event)

  // ── 1. Tipos explícitos de ganho/perda ─────────────────────────────────
  if (et === 'closed_won') return 'won'
  if (et === 'closed_lost') return 'lost'

  // ── 2. Próxima ação ────────────────────────────────────────────────────
  if (et === 'next_action_set') return 'next_action'

  // ── 3. Destino ganho/perdido (retrocompatibilidade: stage_changed → ganho) ─
  if (to === 'ganho') return 'won'
  if (to === 'perdido') return 'lost'

  // ── 4 & 5. stage_changed: real move vs falsa transição ─────────────────
  if (et === 'stage_changed') {
    if (from && to && from !== to) return 'stage_move'
    return 'activity'
  }

  // ── 6. IDs de ação do catálogo (Fase 2.1) ──────────────────────────────
  const resolved = resolveActionId(et)
  if (/^(novo|contato|respondeu|negociacao)_/.test(resolved)) return 'activity'
  // legacy quick_ IDs que não sejam won/lost
  if (et.startsWith('quick_') && et !== 'quick_closed_won' && et !== 'quick_closed_lost') return 'activity'
  // origem quick_action no metadata
  if (normalize((event.metadata ?? {}).source) === 'quick_action') return 'activity'

  // ── 7. Tipos de atividade explícitos ───────────────────────────────────
  const ACTIVITY_TYPES = new Set([
    'contacted', 'replied', 'note_added', 'lead_created',
    'cycle_created', 'assigned', 'reassigned', 'returned_to_pool',
    'owner_assigned',
  ])
  if (ACTIVITY_TYPES.has(et)) return 'activity'

  // ── 8. Default ────────────────────────────────────────────────────────
  return 'activity'
}

// ---------------------------------------------------------------------------
// isRealStageMove — atalho
// ---------------------------------------------------------------------------

/**
 * Retorna true se e somente se houve uma troca real de etapa
 * (from_stage ≠ to_stage e ambos presentes).
 */
export function isRealStageMove(event: ClassifiableEvent): boolean {
  return classifyEvent(event) === 'stage_move'
}

// ---------------------------------------------------------------------------
// Labels, ícones e cores por tipo
// ---------------------------------------------------------------------------

const KIND_LABELS: Record<EventKind, string> = {
  stage_move:  'Movimentação',
  activity:    'Atividade',
  next_action: 'Próxima ação',
  won:         'Ganho',
  lost:        'Perda',
}

/** Label em pt-BR para o tipo de evento */
export function getEventKindLabel(kind: EventKind): string {
  return KIND_LABELS[kind]
}

const KIND_ICONS: Record<EventKind, string> = {
  stage_move:  '→',
  activity:    '📋',
  next_action: '📅',
  won:         '✅',
  lost:        '❌',
}

/** Emoji/ícone representativo do tipo de evento */
export function getEventKindIcon(kind: EventKind): string {
  return KIND_ICONS[kind]
}

const KIND_COLORS: Record<EventKind, string> = {
  stage_move:  '#60a5fa',  // azul
  activity:    '#a855f7',  // roxo
  next_action: '#fde68a',  // amarelo
  won:         '#34d399',  // verde
  lost:        '#f87171',  // vermelho
}

/** Cor hex para diferenciação visual do tipo de evento */
export function getEventKindColor(kind: EventKind): string {
  return KIND_COLORS[kind]
}

const KIND_DOT_COLORS: Record<EventKind, string> = {
  stage_move:  '#3b82f6',
  activity:    '#9333ea',
  next_action: '#f59e0b',
  won:         '#10b981',
  lost:        '#ef4444',
}

/** Cor do ponto/dot na timeline para o tipo de evento */
export function getEventKindDotColor(kind: EventKind): string {
  return KIND_DOT_COLORS[kind]
}

const KIND_BORDER_COLORS: Record<EventKind, string> = {
  stage_move:  '#1a2a3f',
  activity:    '#2a1a3f',
  next_action: '#3f3010',
  won:         '#1a3a28',
  lost:        '#3f1c1c',
}

/** Cor da borda do card na timeline */
export function getEventKindBorderColor(kind: EventKind): string {
  return KIND_BORDER_COLORS[kind]
}
