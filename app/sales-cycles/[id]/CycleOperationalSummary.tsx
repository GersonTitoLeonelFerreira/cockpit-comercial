// ---------------------------------------------------------------------------
// CycleOperationalSummary — bloco de contexto comercial rápido para o ciclo
// Adaptado de LeadOperationalSummary para cycle_events (usa occurred_at).
// Sem chamadas a banco — recebe os eventos já buscados pela página.
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react'

interface CycleEvent {
  id: string
  event_type: string
  from_stage: string | null
  to_stage: string | null
  occurred_at: string
  metadata: Record<string, unknown> | null
}

interface CycleSummary {
  status: string
  won_total?: number | null
  won_note?: string | null
  payment_method?: string | null
  payment_type?: string | null
  products?: { name?: string; category?: string } | null
}

interface Props {
  events: CycleEvent[]
  ciclo?: CycleSummary | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LEAD_STATUS_PT: Record<string, string> = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'RESPONDEU',
  negociacao: 'NEGOCIAÇÃO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
}

const PAYMENT_METHOD_PT: Record<string, string> = {
  pix: 'PIX',
  credito: 'Cartão de Crédito',
  debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  misto: 'Misto',
  outro: 'Outro',
}

function stageLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return LEAD_STATUS_PT[s.toLowerCase()] ?? s.toUpperCase()
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR')
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Extrai o objeto de checkpoint compatível com eventos antigos e novos */
function getCheckpoint(ev: CycleEvent): Record<string, unknown> {
  const m = ev.metadata ?? {}
  return (m.checkpoint as Record<string, unknown>) ??
    (m.metadata as Record<string, unknown>) ??
    m
}

function str(v: unknown): string | null {
  if (v == null || v === '') return null
  return String(v)
}

// ---------------------------------------------------------------------------
// Extração dos resumos (determinística, baseada nos eventos recebidos)
// ---------------------------------------------------------------------------

interface SummaryItem {
  label: string
  content: ReactNode
  date?: string
}

function buildSummary(events: CycleEvent[], ciclo?: CycleSummary | null): SummaryItem[] {
  const items: SummaryItem[] = []

  // ── 1. Última movimentação relevante (stage_changed) ─────────────────────
  const lastMove = events.find(ev => {
    const m = ev.metadata ?? {}
    const from = ev.from_stage ?? str(m.from_status)
    const to = ev.to_stage ?? str(m.to_status)
    return from && to
  })
  if (lastMove) {
    const m = lastMove.metadata ?? {}
    const from = lastMove.from_stage ?? str(m.from_status)
    const to = lastMove.to_stage ?? str(m.to_status)
    items.push({
      label: 'Última movimentação',
      content: (
        <span>
          <span style={{ color: '#93c5fd' }}>{stageLabel(from)}</span>
          <span style={{ opacity: 0.55 }}> → </span>
          <span style={{ color: '#93c5fd', fontWeight: 700 }}>{stageLabel(to)}</span>
        </span>
      ),
      date: lastMove.occurred_at,
    })
  }

  // ── 2. Última próxima ação definida ──────────────────────────────────────
  const lastNextAction =
    events.find(ev => ev.event_type === 'next_action_set') ??
    events.find(ev => {
      const cp = getCheckpoint(ev)
      return !!str(cp.next_action)
    })
  if (lastNextAction) {
    const cp = getCheckpoint(lastNextAction)
    const action = str(cp.next_action)
    const actionDate = str(cp.next_action_date)
    const formattedDate = fmtDate(actionDate)
    if (action || lastNextAction.event_type === 'next_action_set') {
      items.push({
        label: 'Próxima ação',
        content: (
          <span>
            {action ? (
              <>
                <span style={{ color: '#fde68a' }}>{action}</span>
                {formattedDate !== '—' && (
                  <span style={{ opacity: 0.55 }}> — {formattedDate}</span>
                )}
              </>
            ) : (
              <span style={{ opacity: 0.6 }}>Definida (sem detalhe registrado)</span>
            )}
          </span>
        ),
        date: lastNextAction.occurred_at,
      })
    }
  }

  // ── 3. Última objeção / detalhe relevante ────────────────────────────────
  const lastDetail = events.find(ev => {
    const cp = getCheckpoint(ev)
    return !!str(cp.result_detail)
  })
  if (lastDetail) {
    const cp = getCheckpoint(lastDetail)
    items.push({
      label: 'Último detalhe registrado',
      content: <span style={{ opacity: 0.85 }}>{str(cp.result_detail)}</span>,
      date: lastDetail.occurred_at,
    })
  }

  // ── 4. Última proposta / condição discutida (nota de evento) ─────────────
  const lastNote = events.find(ev => {
    const m = ev.metadata ?? {}
    const to = ev.to_stage ?? str(m.to_status)
    const isLoss = to && String(to).toLowerCase() === 'perdido'
    const cp = getCheckpoint(ev)
    return !isLoss && !!str(cp.note)
  })
  if (lastNote) {
    const cp = getCheckpoint(lastNote)
    items.push({
      label: 'Última observação',
      content: <em style={{ opacity: 0.85 }}>{str(cp.note)}</em>,
      date: lastNote.occurred_at,
    })
  }

  // ── 5. Último contexto de ganho / perda ──────────────────────────────────
  const lastFinal = events.find(ev => {
    const m = ev.metadata ?? {}
    const to = ev.to_stage ?? str(m.to_status)
    return to && (String(to).toLowerCase() === 'ganho' || String(to).toLowerCase() === 'perdido')
  })
  if (lastFinal) {
    const m = lastFinal.metadata ?? {}
    const to = lastFinal.to_stage ?? str(m.to_status)
    const isWon = to && String(to).toLowerCase() === 'ganho'
    const isLoss = to && String(to).toLowerCase() === 'perdido'
    const cp = getCheckpoint(lastFinal)

    if (isWon && ciclo && ciclo.status === 'ganho') {
      const parts: ReactNode[] = []
      if (ciclo.won_total != null) {
        parts.push(
          <span key="val">
            <span style={{ opacity: 0.55 }}>Valor: </span>
            <span style={{ color: '#86efac', fontWeight: 700 }}>{fmtCurrency(ciclo.won_total)}</span>
          </span>
        )
      }
      if (ciclo.products?.name) {
        parts.push(
          <span key="prod">
            <span style={{ opacity: 0.55 }}>Produto: </span>
            <span>{ciclo.products.category ? `${ciclo.products.name} (${ciclo.products.category})` : ciclo.products.name}</span>
          </span>
        )
      }
      if (ciclo.payment_method) {
        parts.push(
          <span key="pay">
            <span style={{ opacity: 0.55 }}>Pagamento: </span>
            <span>{PAYMENT_METHOD_PT[ciclo.payment_method] ?? ciclo.payment_method}</span>
          </span>
        )
      }
      if (ciclo.won_note) {
        parts.push(
          <span key="note">
            <span style={{ opacity: 0.55 }}>Nota: </span>
            <em style={{ opacity: 0.85 }}>{ciclo.won_note}</em>
          </span>
        )
      }
      if (parts.length === 0) {
        parts.push(<span key="ok" style={{ color: '#86efac' }}>Fechado como GANHO</span>)
      }
      items.push({
        label: 'Contexto do fechamento',
        content: (
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 16px' }}>
            {parts}
          </span>
        ),
        date: lastFinal.occurred_at,
      })
    } else if (isLoss) {
      const reason = str(cp.lost_reason)
      const note = str(cp.note)
      items.push({
        label: 'Contexto da perda',
        content: (
          <span>
            {reason && (
              <span>
                <span style={{ opacity: 0.55 }}>Motivo: </span>
                <span style={{ color: '#fca5a5' }}>{reason}</span>
              </span>
            )}
            {note && (
              <span style={{ marginLeft: reason ? 12 : 0 }}>
                <span style={{ opacity: 0.55 }}>Obs.: </span>
                <em style={{ opacity: 0.85 }}>{note}</em>
              </span>
            )}
            {!reason && !note && (
              <span style={{ color: '#fca5a5' }}>Marcado como PERDIDO</span>
            )}
          </span>
        ),
        date: lastFinal.occurred_at,
      })
    }
  }

  return items
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CycleOperationalSummary({ events, ciclo }: Props) {
  if (!events || events.length === 0) return null

  const items = buildSummary(events, ciclo)
  if (items.length === 0) return null

  return (
    <div
      style={{
        marginTop: 20,
        padding: '14px 16px',
        border: '1px solid #313145',
        borderRadius: 10,
        background: '#1a1a2e',
      }}
    >
      <div style={{ fontSize: 11, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
        Resumo Operacional
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              flexWrap: 'wrap',
              padding: '6px 10px',
              borderRadius: 7,
              background: '#23232b',
              border: '1px solid #313145',
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 10, opacity: 0.45, textTransform: 'uppercase', letterSpacing: 0.8, display: 'block', marginBottom: 2 }}>
                {item.label}
              </span>
              <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.45 }}>{item.content}</div>
            </div>
            {item.date && (
              <span style={{ fontSize: 11, opacity: 0.4, flexShrink: 0, paddingTop: 2, whiteSpace: 'nowrap' }}>
                {fmtDate(item.date)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
