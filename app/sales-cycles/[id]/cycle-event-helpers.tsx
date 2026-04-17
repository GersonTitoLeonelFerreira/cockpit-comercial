// ---------------------------------------------------------------------------
// cycle-event-helpers.tsx — Shared helpers and card components for cycle pages
// Imported by both page.tsx (server) and CyclePageTabs.tsx (client)
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CycleEvent {
  id: string
  event_type: string
  from_stage: string | null
  to_stage: string | null
  occurred_at: string
  metadata: Record<string, unknown> | null
}

/**
 * Semantic classification of a cycle event for visual rendering.
 *
 * - ganho:        Won deal (closed_won or stage_changed → ganho)
 * - perda:        Lost deal (closed_lost or stage_changed → perdido)
 * - movimentacao: Real stage transition (from_status !== to_status, both present)
 * - atividade:    Commercial activity (quick actions, contacted, replied, note_added,
 *                 or stage_changed with no real status change — false transition)
 * - proxima_acao: Next action set/updated (next_action_set)
 * - sistema:      Admin/system event (cycle_created, owner_assigned, etc.)
 */
export type EventClass =
  | 'ganho'
  | 'perda'
  | 'movimentacao'
  | 'atividade'
  | 'proxima_acao'
  | 'sistema'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const STATUS_PT: Record<string, string> = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'RESPONDEU',
  negociacao: 'NEGOCIAÇÃO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
}

export const PAYMENT_METHOD_PT: Record<string, string> = {
  pix: 'PIX', credito: 'Cartão de Crédito', debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência',
  misto: 'Misto', outro: 'Outro',
}
export const PAYMENT_TYPE_PT: Record<string, string> = {
  avista: 'À Vista', entrada_parcelas: 'Entrada + Parcelas',
  parcelado_sem_entrada: 'Parcelado (sem entrada)',
  recorrente: 'Recorrente', outro: 'Outro',
}

export const BRAZIL_PHONE_PREFIX = '55'
export const DAYS_STALE_THRESHOLD = 7
export const DEFAULT_ACTION_BORDER_COLOR = '#4b5563'
/** Hex alpha suffix for light tint backgrounds (~8% opacity) */
export const HEX_ALPHA_LIGHT = '14'
/** Hex alpha suffix for medium tint borders (~27% opacity) */
export const HEX_ALPHA_MEDIUM = '44'
export const MONOSPACE_FONT = 'monospace'
export const MILLISECONDS_PER_DAY = 1000 * 60 * 60 * 24

export const COLOR_BLUE = '#60a5fa'
export const COLOR_PURPLE = '#a855f7'
export const COLOR_YELLOW = '#fde68a'
export const COLOR_GREEN = '#34d399'
export const COLOR_RED = '#f87171'

export const STATUS_BADGE: Record<string, { background: string; color: string }> = {
  novo:       { background: 'rgba(96,165,250,0.15)',  color: COLOR_BLUE },
  contato:    { background: 'rgba(96,165,250,0.15)',  color: COLOR_BLUE },
  respondeu:  { background: 'rgba(168,85,247,0.15)',  color: COLOR_PURPLE },
  negociacao: { background: 'rgba(253,224,138,0.15)', color: COLOR_YELLOW },
  ganho:      { background: 'rgba(52,211,153,0.15)',  color: COLOR_GREEN },
  perdido:    { background: 'rgba(248,113,113,0.15)', color: COLOR_RED },
}

/** Dot color for each event class in the timeline */
export const EVENT_CLASS_DOT_COLOR: Record<EventClass, string> = {
  ganho:        COLOR_GREEN,
  perda:        COLOR_RED,
  movimentacao: COLOR_BLUE,
  atividade:    COLOR_PURPLE,
  proxima_acao: COLOR_YELLOW,
  sistema:      '#4b5563',
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

export function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return STATUS_PT[String(s).toLowerCase()] ?? String(s).toUpperCase()
}

export function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR')
}

export function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}

export function extractCheckpoint(meta: Record<string, unknown>): Record<string, unknown> {
  if (meta.checkpoint && typeof meta.checkpoint === 'object') return meta.checkpoint as Record<string, unknown>
  if (meta.metadata && typeof meta.metadata === 'object') return meta.metadata as Record<string, unknown>
  return meta
}

export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  if (!clean) return null
  return `https://wa.me/${clean.startsWith(BRAZIL_PHONE_PREFIX) ? clean : BRAZIL_PHONE_PREFIX + clean}`
}

export function statusBadgeStyle(s: string | null | undefined): { background: string; color: string } {
  const key = (s ?? '').toLowerCase()
  return STATUS_BADGE[key] ?? { background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }
}

/** Returns badge label+color and border color for a next_action_date */
export function getNextActionUrgency(dateIso: string | null | undefined): {
  badge: { label: string; color: string } | null
  borderColor: string
} {
  if (!dateIso) return { badge: null, borderColor: DEFAULT_ACTION_BORDER_COLOR }
  const d = new Date(dateIso)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const isPast = d < now && !isToday
  if (isPast) return { badge: { label: 'Vencida', color: COLOR_RED }, borderColor: COLOR_RED }
  if (isToday) return { badge: { label: 'Hoje', color: COLOR_YELLOW }, borderColor: COLOR_YELLOW }
  return { badge: { label: 'Futura', color: COLOR_BLUE }, borderColor: COLOR_BLUE }
}

export function getEventTitle(event: CycleEvent): string {
  const m = event.metadata ?? {}
  const from = (m.from_status as string) ?? (event.from_stage as string)
  const to = (m.to_status as string) ?? (event.to_stage as string)
  if (from || to) {
    return `${from ? statusLabel(from) : '?'} → ${to ? statusLabel(to) : '?'}`
  }
  const EVENT_LABELS: Record<string, string> = {
    assigned: 'Ciclo atribuído',
    reassigned: 'Ciclo reatribuído',
    returned_to_pool: 'Devolvido ao pool',
    cycle_created: 'Ciclo criado',
    owner_assigned: 'Proprietário atribuído',
    next_action_set: 'Próxima ação definida',
    note_added: 'Nota adicionada',
    contacted: 'Contato registrado',
    replied: 'Resposta registrada',
    ai_analysis_generated: 'Análise da IA gerada',
    ai_suggestion_applied: 'Sugestão da IA aplicada',
    ai_suggestion_rejected: 'Sugestão da IA descartada',
  }
  return EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, ' ')
}

/**
 * Deterministically classify a cycle event into one of the semantic types.
 * Used to select the correct card component and dot color in the timeline.
 */
export function classifyEvent(event: CycleEvent): EventClass {
  const et = event.event_type
  const m = event.metadata ?? {}

  if (et === 'closed_won') return 'ganho'
  if (et === 'closed_lost') return 'perda'
  if (et === 'next_action_set') return 'proxima_acao'

  if (et === 'stage_changed') {
    const toStatus = ((m.to_status as string) ?? event.to_stage ?? '').toLowerCase().trim()
    const fromStatus = ((m.from_status as string) ?? event.from_stage ?? '').toLowerCase().trim()

    if (toStatus === 'ganho') return 'ganho'
    if (toStatus === 'perdido') return 'perda'
    // Real transition: both statuses exist and differ
    if (fromStatus && toStatus && fromStatus !== toStatus) return 'movimentacao'
    // False transition: same stage or missing stage info → treat as activity
    return 'atividade'
  }

  if (et === 'contacted' || et === 'replied' || et === 'note_added') return 'atividade'
  // Quick actions stored with source: 'quick_action'
  if (m.source === 'quick_action') return 'atividade'

  return 'sistema'
}

// ---------------------------------------------------------------------------
// Labels for activity events (quick actions, contacted, etc.)
// ---------------------------------------------------------------------------

const ACTIVITY_EVENT_LABELS: Record<string, string> = {
  contacted: 'Contato registrado',
  replied: 'Resposta registrada',
  note_added: 'Nota adicionada',
  // Quick action types (stored in metadata.action_type or metadata.detail)
  quick_approach_contact: 'Abordagem registrada',
  quick_call_done: 'Ligação realizada',
  quick_whats_sent: 'WhatsApp enviado',
  quick_email_sent: 'Email enviado',
  quick_bad_data: 'Telefone incorreto',
  quick_showed_interest: 'Interesse registrado',
  quick_asked_info: 'Pedido de informação',
  quick_answered_doubt: 'Dúvida respondida',
  quick_scheduled: 'Agendamento registrado',
  quick_asked_proposal: 'Pedido de proposta',
  quick_qualified: 'Lead qualificado',
  quick_proposal_presented: 'Proposta apresentada',
  quick_doubt_answered: 'Dúvida respondida',
  quick_visit_scheduled: 'Visita agendada',
  quick_negotiation_started: 'Negociação iniciada',
  quick_final_proposal_sent: 'Proposta final enviada',
  quick_objection_registered: 'Objeção registrada',
  quick_commercial_condition: 'Condição comercial',
  quick_closing_scheduled: 'Fechamento agendado',
  quick_closed_won: 'Fechamento registrado',
  quick_closed_lost: 'Perda registrada',
  quick_proposal: 'Proposta registrada',
}

function getActivityLabel(event: CycleEvent): string {
  const m = event.metadata ?? {}
  // Check metadata for quick action type
  const actionType = (m.action_type as string) ?? (m.quick_action_type as string)
  if (actionType && ACTIVITY_EVENT_LABELS[actionType]) return ACTIVITY_EVENT_LABELS[actionType]
  // Check metadata detail for quick action type key
  const detail = m.detail as string | undefined
  if (detail && ACTIVITY_EVENT_LABELS[detail]) return ACTIVITY_EVENT_LABELS[detail]
  // Fall back to event_type label
  return ACTIVITY_EVENT_LABELS[event.event_type] ?? 'Atividade registrada'
}

// ---------------------------------------------------------------------------
// Card components (used in history timeline)
// ---------------------------------------------------------------------------

export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div style={{ fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: '#8b8fa2', marginRight: 6 }}>{label}:</span>
      <span style={{ color: '#f1f5f9' }}>{value}</span>
    </div>
  )
}

/** Card for real stage transitions (from_status !== to_status). */
export function CheckpointCard({ event }: { event: CycleEvent }) {
  const m = event.metadata ?? {}
  const cp = extractCheckpoint(m)
  const from = (m.from_status as string) ?? (event.from_stage as string)
  const to = (m.to_status as string) ?? (event.to_stage as string)
  const nextActionDate = cp.next_action_date
    ? (() => {
      const d = new Date(cp.next_action_date as string)
      return isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR')
    })()
    : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, color: '#60a5fa', display: 'flex', alignItems: 'center', gap: 6 }}>
          {from || to ? (
            <>
              <span style={{ ...statusBadgeStyle(from), padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{statusLabel(from)}</span>
              <span style={{ color: '#8b8fa2', fontSize: 13 }}>→</span>
              <span style={{ ...statusBadgeStyle(to), padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>{statusLabel(to)}</span>
            </>
          ) : 'Movimentação'}
        </div>
        <div style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at)}</div>
      </div>
      {!!(cp.action_channel || cp.action_result || cp.result_detail || cp.next_action || cp.note) && (
        <div style={{ marginTop: 8 }}>
          <FieldRow label="Canal" value={cp.action_channel != null ? String(cp.action_channel) : undefined} />
          <FieldRow label="Resultado" value={cp.action_result != null ? String(cp.action_result) : undefined} />
          {!!cp.result_detail && <FieldRow label="Detalhe" value={String(cp.result_detail)} />}
          {!!cp.next_action && (
            <FieldRow
              label="Próxima ação"
              value={nextActionDate ? `${cp.next_action} — ${nextActionDate}` : String(cp.next_action)}
            />
          )}
          {!!cp.note && <FieldRow label="Observação" value={<em>{String(cp.note)}</em>} />}
        </div>
      )}
    </div>
  )
}

/**
 * Card for commercial activities: quick actions, contacted, replied, note_added,
 * and false stage_changed transitions (from_stage === to_stage or missing).
 * Does NOT display a stage transition arrow.
 */
export function ActivityCard({ event }: { event: CycleEvent }) {
  const m = event.metadata ?? {}
  const cp = extractCheckpoint(m)
  const label = getActivityLabel(event)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#a855f7', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at)}</span>
      </div>
      {!!(cp.action_channel || cp.action_result || cp.result_detail || cp.detail || cp.note) && (
        <div style={{ marginTop: 8 }}>
          <FieldRow label="Canal" value={cp.action_channel != null ? String(cp.action_channel) : undefined} />
          <FieldRow label="Resultado" value={cp.action_result != null ? String(cp.action_result) : undefined} />
          {!!cp.result_detail && <FieldRow label="Detalhe" value={String(cp.result_detail)} />}
          {!cp.result_detail && !!cp.detail && <FieldRow label="Detalhe" value={String(cp.detail)} />}
          {!!cp.note && <FieldRow label="Observação" value={<em>{String(cp.note)}</em>} />}
        </div>
      )}
    </div>
  )
}

/** Card for next_action_set events — shows the scheduled next action with date. */
export function NextActionCard({ event }: { event: CycleEvent }) {
  const m = event.metadata ?? {}
  const cp = extractCheckpoint(m)

  const nextAction = (cp.next_action as string | undefined) ?? (m.next_action as string | undefined)
  const nextActionDate = (cp.next_action_date as string | undefined) ?? (m.next_action_date as string | undefined)
  const formattedDate = fmtDateShort(nextActionDate)

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#fde68a', fontWeight: 600 }}>Próxima ação definida</span>
        <span style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at)}</span>
      </div>
      {nextAction && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 13, color: '#f1f5f9' }}>{nextAction}</div>
          {formattedDate !== '—' && (
            <div style={{ fontSize: 12, color: '#8b8fa2', marginTop: 4 }}>Para: {formattedDate}</div>
          )}
        </div>
      )}
      {!!cp.note && (
        <div style={{ marginTop: 4 }}>
          <FieldRow label="Observação" value={<em>{String(cp.note)}</em>} />
        </div>
      )}
    </div>
  )
}

export function LostCard({ event }: { event: CycleEvent }) {
  const m = event.metadata ?? {}
  const cp = extractCheckpoint(m)
  const from = (m.from_status as string) ?? (event.from_stage as string)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, color: '#f87171' }}>
          {from ? `${statusLabel(from)} → PERDIDO` : 'PERDIDO'}
        </div>
        <div style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at)}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        <FieldRow label="Canal" value={cp.action_channel != null ? String(cp.action_channel) : undefined} />
        {!!cp.lost_reason &&
          <FieldRow label="Motivo da perda" value={<span style={{ color: '#fca5a5' }}>{String(cp.lost_reason)}</span>} />}
        {!!cp.note && <FieldRow label="Observação" value={<em>{String(cp.note)}</em>} />}
      </div>
    </div>
  )
}

export function WonCard({ cycle }: { cycle: Record<string, unknown> }) {
  const payMethod = cycle.payment_method ? (PAYMENT_METHOD_PT[cycle.payment_method as string] ?? (cycle.payment_method as string)) : null
  const payType = cycle.payment_type ? (PAYMENT_TYPE_PT[cycle.payment_type as string] ?? (cycle.payment_type as string)) : null
  const products = cycle.products as { name?: string; category?: string } | null
  const productLabel = products?.name
    ? products.category
      ? `${products.name} (${products.category})`
      : products.name
    : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, color: '#34d399' }}>
          {cycle.previous_status ? `${statusLabel(cycle.previous_status as string)} → GANHO` : 'GANHO'}
        </div>
        <div style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(cycle.won_at as string)}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        {cycle.won_total != null && (
          <FieldRow label="Valor" value={<span style={{ color: '#6ee7b7', fontWeight: 700 }}>{fmtCurrency(cycle.won_total as number)}</span>} />
        )}
        {productLabel && <FieldRow label="Produto" value={productLabel} />}
        {payMethod && <FieldRow label="Meio de pagamento" value={payMethod} />}
        {payType && <FieldRow label="Negociação" value={payType} />}
        {(cycle.installments_count as number) > 0 && (
          <FieldRow label="Parcelas" value={`${cycle.installments_count}x${cycle.installment_amount ? ` de ${fmtCurrency(cycle.installment_amount as number)}` : ''}`} />
        )}
        {(cycle.entry_amount as number) > 0 && (
          <FieldRow label="Entrada" value={fmtCurrency(cycle.entry_amount as number)} />
        )}
        {!!cycle.payment_notes && <FieldRow label="Obs. pagamento" value={String(cycle.payment_notes)} />}
        {!!cycle.won_note && <FieldRow label="Nota do fechamento" value={<em>{String(cycle.won_note)}</em>} />}
      </div>
    </div>
  )
}

export function AdminCard({ event }: { event: CycleEvent }) {
  const m = event.metadata ?? {}
  const suggestion =
    m.suggestion && typeof m.suggestion === 'object'
      ? (m.suggestion as Record<string, unknown>)
      : null

  const EVENT_LABELS: Record<string, string> = {
    assigned: 'Ciclo atribuído',
    reassigned: 'Ciclo reatribuído',
    returned_to_pool: 'Devolvido ao pool',
    cycle_created: 'Ciclo criado',
    owner_assigned: 'Proprietário atribuído',
    next_action_set: 'Próxima ação definida',
    note_added: 'Nota adicionada',
    contacted: 'Contato registrado',
    replied: 'Resposta registrada',
    ai_analysis_generated: 'Análise da IA gerada',
    ai_suggestion_applied: 'Sugestão da IA aplicada',
    ai_suggestion_rejected: 'Sugestão da IA descartada',
  }

  const label = EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, ' ')

  const suggestedStatus =
    (suggestion?.recommended_status as string | undefined) ??
    (m.suggested_status as string | undefined) ??
    (m.applied_status as string | undefined)

  const nextAction =
    (suggestion?.next_action as string | undefined) ??
    (m.next_action as string | undefined)

  const summary =
    (suggestion?.summary as string | undefined) ??
    (m.edited_summary as string | undefined)

  const confidence =
    typeof suggestion?.confidence === 'number'
      ? Math.round((suggestion.confidence as number) * 100)
      : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#8b8fa2', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at)}</span>
      </div>

      {(event.event_type === 'ai_analysis_generated' ||
        event.event_type === 'ai_suggestion_applied' ||
        event.event_type === 'ai_suggestion_rejected') && (
        <div style={{ marginTop: 8 }}>
          {suggestedStatus && (
            <FieldRow
              label="Status sugerido"
              value={
                <span style={{ ...statusBadgeStyle(suggestedStatus), padding: '2px 8px', borderRadius: 4, fontSize: 12, fontWeight: 700 }}>
                  {statusLabel(suggestedStatus)}
                </span>
              }
            />
          )}

          {confidence !== null && (
            <FieldRow label="Confiança" value={`${confidence}%`} />
          )}

          {!!nextAction && (
            <FieldRow label="Próxima ação" value={nextAction} />
          )}

          {!!summary && (
            <FieldRow label="Resumo" value={<em>{summary}</em>} />
          )}
        </div>
      )}

      {!!m.reason && (
        <div style={{ marginTop: 4, color: '#8b8fa2', fontSize: 13 }}>
          <span>Motivo: </span><em>{String(m.reason)}</em>
        </div>
      )}

      {!!m.details && (
        <div style={{ marginTop: 4, color: '#8b8fa2', fontSize: 13 }}>
          <span>Detalhe: </span><em>{String(m.details)}</em>
        </div>
      )}
    </div>
  )
}

/**
 * Renders the correct card component for a given event based on its classification.
 * Handles all event types with fallback for unknown/legacy events.
 */
export function EventCard({ event, cycle }: { event: CycleEvent; cycle?: Record<string, unknown> }) {
  const cls = classifyEvent(event)
  switch (cls) {
    case 'ganho':
      // If cycle data is provided, prefer the richer WonCard with cycle details
      // otherwise fall back to CheckpointCard which shows the transition
      return cycle ? <WonCard cycle={cycle} /> : <CheckpointCard event={event} />
    case 'perda':
      return <LostCard event={event} />
    case 'movimentacao':
      return <CheckpointCard event={event} />
    case 'atividade':
      return <ActivityCard event={event} />
    case 'proxima_acao':
      return <NextActionCard event={event} />
    case 'sistema':
      return <AdminCard event={event} />
  }
}
