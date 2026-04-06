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
  }
  return EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, ' ')
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
        <div style={{ fontWeight: 700, color: '#60a5fa' }}>
          {from || to ? (
            <>{statusLabel(from)} <span style={{ color: '#8b8fa2' }}>→</span> {statusLabel(to)}</>
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
  }
  const label = EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, ' ')
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#8b8fa2', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at)}</span>
      </div>
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
