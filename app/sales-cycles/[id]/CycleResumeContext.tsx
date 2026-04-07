// ---------------------------------------------------------------------------
// CycleResumeContext — "Antes de falar com este lead"
// Retomada inteligente baseada no histórico já salvo (cycle_events).
// Extração determinística — sem IA, sem texto inventado.
// ---------------------------------------------------------------------------

import type { ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Tipos locais (compatível com CycleEvent de cycle-event-helpers)
// ---------------------------------------------------------------------------

interface CycleEvent {
  id: string
  event_type: string
  from_stage: string | null
  to_stage: string | null
  occurred_at: string
  metadata: Record<string, unknown> | null
}

interface CycleSummary {
  status?: string | null
  won_total?: number | null
  won_note?: string | null
  payment_method?: string | null
  payment_type?: string | null
  products?: { name?: string; category?: string } | null
}

interface Props {
  events: CycleEvent[]
  cycle?: CycleSummary | null
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('pt-BR')
}

function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Extrai o objeto de checkpoint compatível com eventos antigos e novos.
 * Tenta 3 caminhos: metadata.checkpoint, metadata.metadata, e o próprio metadata.
 */
function getCheckpoint(ev: CycleEvent): Record<string, unknown> {
  const m = ev.metadata ?? {}
  return (
    (m.checkpoint as Record<string, unknown>) ??
    (m.metadata as Record<string, unknown>) ??
    m
  )
}

/** Converte null/undefined/'' para null; qualquer outro valor vira string. */
function str(v: unknown): string | null {
  if (v == null || v === '') return null
  return String(v)
}

function toLower(v: unknown): string {
  return String(v ?? '').toLowerCase()
}

// ---------------------------------------------------------------------------
// Faceta de retomada
// ---------------------------------------------------------------------------

interface ResumeItem {
  icon: string
  label: string
  content: ReactNode
  date?: string
}

// ---------------------------------------------------------------------------
// Extração determinística das facetas
// ---------------------------------------------------------------------------

function buildResumeItems(
  events: CycleEvent[],
  cycle?: CycleSummary | null,
): ResumeItem[] {
  const items: ResumeItem[] = []

  // ── Faceta 1: Última objeção ──────────────────────────────────────────────
  // Primeiro evento (mais recente) que tenha result_detail preenchido
  const objectionEvent = events.find(ev => {
    const cp = getCheckpoint(ev)
    return !!str(cp.result_detail)
  })
  if (objectionEvent) {
    const cp = getCheckpoint(objectionEvent)
    items.push({
      icon: '⚠️',
      label: 'Última objeção registrada',
      content: <span style={{ color: '#fcd34d' }}>{str(cp.result_detail)}</span>,
      date: objectionEvent.occurred_at,
    })
  }

  // ── Faceta 2: Última proposta / observação (excluindo perdas) ────────────
  // Primeiro evento com note onde to_status !== 'perdido'
  const noteEvent = events.find(ev => {
    const m = ev.metadata ?? {}
    const to = ev.to_stage ?? str(m.to_status)
    const isLoss = to && toLower(to) === 'perdido'
    const cp = getCheckpoint(ev)
    return !isLoss && !!str(cp.note)
  })
  if (noteEvent) {
    const cp = getCheckpoint(noteEvent)
    items.push({
      icon: '📋',
      label: 'Última proposta / observação',
      content: <em style={{ opacity: 0.9 }}>{str(cp.note)}</em>,
      date: noteEvent.occurred_at,
    })
  }

  // ── Faceta 3: Perda anterior ─────────────────────────────────────────────
  // Conta todas as perdas; mostra motivo da mais recente
  const lossEvents = events.filter(ev => {
    const m = ev.metadata ?? {}
    const to = ev.to_stage ?? str(m.to_status)
    return to && toLower(to) === 'perdido'
  })
  const lossCount = lossEvents.length
  if (lossCount > 0) {
    const mostRecentLoss = lossEvents[0] // events está ordenado DESC
    const cp = getCheckpoint(mostRecentLoss)
    // Tentar lost_reason e loss_reason (campos históricos diferentes)
    const reason = str(cp.lost_reason) ?? str(cp.loss_reason)
    const lossNote = str(cp.note)
    const currentStatus = toLower(cycle?.status ?? '')

    // Só mostrar se não for a perda atual (i.e., se o lead retornou ou é a perda atual)
    const isCurrentlyLost = currentStatus === 'perdido'

    items.push({
      icon: '❌',
      label: isCurrentlyLost
        ? `Perda registrada${lossCount > 1 ? ` (${lossCount}x)` : ''}`
        : `Já foi perdido antes${lossCount > 1 ? ` (${lossCount}x)` : ''}`,
      content: (
        <span>
          {reason && (
            <span>
              <span style={{ opacity: 0.55 }}>Motivo: </span>
              <span style={{ color: '#fca5a5' }}>{reason}</span>
            </span>
          )}
          {lossNote && (
            <span style={{ marginLeft: reason ? 10 : 0 }}>
              <span style={{ opacity: 0.55 }}>Obs.: </span>
              <em style={{ opacity: 0.85 }}>{lossNote}</em>
            </span>
          )}
          {!reason && !lossNote && (
            <span style={{ color: '#fca5a5', opacity: 0.8 }}>Sem motivo registrado</span>
          )}
        </span>
      ),
      date: mostRecentLoss.occurred_at,
    })
  }

  // ── Faceta 4: Ganho anterior ─────────────────────────────────────────────
  const winEvents = events.filter(ev => {
    const m = ev.metadata ?? {}
    const to = ev.to_stage ?? str(m.to_status)
    return to && toLower(to) === 'ganho'
  })
  if (winEvents.length > 0) {
    const currentStatus = toLower(cycle?.status ?? '')
    const isCurrentlyWon = currentStatus === 'ganho'

    if (isCurrentlyWon && cycle) {
      // Ganho atual: mostrar valor/produto/pagamento
      const parts: ReactNode[] = []
      if (cycle.won_total != null) {
        parts.push(
          <span key="val">
            <span style={{ opacity: 0.55 }}>Valor: </span>
            <span style={{ color: '#86efac', fontWeight: 700 }}>{fmtCurrency(cycle.won_total)}</span>
          </span>,
        )
      }
      if (cycle.products?.name) {
        parts.push(
          <span key="prod">
            <span style={{ opacity: 0.55 }}>Produto: </span>
            <span>
              {cycle.products.category
                ? `${cycle.products.name} (${cycle.products.category})`
                : cycle.products.name}
            </span>
          </span>,
        )
      }
      if (cycle.payment_method) {
        parts.push(
          <span key="pay">
            <span style={{ opacity: 0.55 }}>Pagamento: </span>
            <span>{PAYMENT_METHOD_PT[cycle.payment_method] ?? cycle.payment_method}</span>
          </span>,
        )
      }
      if (parts.length > 0) {
        items.push({
          icon: '🏆',
          label: 'Contexto do ganho',
          content: (
            <span style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px' }}>
              {parts}
            </span>
          ),
          date: winEvents[0].occurred_at,
        })
      }
    } else if (!isCurrentlyWon) {
      // Ganho anterior: sinaliza recompra
      items.push({
        icon: '🔄',
        label: `Recompra — já foi ganho antes${winEvents.length > 1 ? ` (${winEvents.length}x)` : ''}`,
        content: (
          <span style={{ color: '#86efac', opacity: 0.9 }}>
            Lead retornou ao funil após ganho anterior
          </span>
        ),
        date: winEvents[0].occurred_at,
      })
    }
  }

  // ── Faceta 5: Retorno ao funil após perda ────────────────────────────────
  // Derivado: perda existe + status atual ≠ perdido
  // (já coberto pela Faceta 3 com texto "Já foi perdido antes")

  // ── Faceta 6: Última próxima ação ─────────────────────────────────────────
  const nextActionEvent =
    events.find(ev => ev.event_type === 'next_action_set') ??
    events.find(ev => {
      const cp = getCheckpoint(ev)
      return !!str(cp.next_action)
    })
  if (nextActionEvent) {
    const cp = getCheckpoint(nextActionEvent)
    const action = str(cp.next_action)
    const actionDate = str(cp.next_action_date)
    if (action) {
      items.push({
        icon: '📌',
        label: 'Última próxima ação registrada',
        content: (
          <span>
            <span style={{ color: '#fde68a' }}>{action}</span>
            {actionDate && (
              <span style={{ opacity: 0.55 }}> — {fmtDateShort(actionDate)}</span>
            )}
          </span>
        ),
        date: nextActionEvent.occurred_at,
      })
    }
  }

  // ── Faceta 7: Último contato (canal + resultado) ──────────────────────────
  const contactEvent = events.find(ev => {
    const cp = getCheckpoint(ev)
    return !!str(cp.action_channel) || !!str(cp.action_result)
  })
  if (contactEvent) {
    const cp = getCheckpoint(contactEvent)
    const channel = str(cp.action_channel)
    const result = str(cp.action_result)
    if (channel || result) {
      items.push({
        icon: '📞',
        label: 'Último contato registrado',
        content: (
          <span>
            {channel && (
              <span>
                <span style={{ opacity: 0.55 }}>Canal: </span>
                <span>{channel}</span>
              </span>
            )}
            {result && (
              <span style={{ marginLeft: channel ? 10 : 0 }}>
                <span style={{ opacity: 0.55 }}>Resultado: </span>
                <span style={{ opacity: 0.9 }}>{result}</span>
              </span>
            )}
          </span>
        ),
        date: contactEvent.occurred_at,
      })
    }
  }

  // Limitar a 7 itens para manter escaneável
  return items.slice(0, 7)
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function CycleResumeContext({ events, cycle }: Props) {
  if (!events || events.length === 0) return null

  const items = buildResumeItems(events, cycle)
  if (items.length === 0) return null

  return (
    <div
      style={{
        padding: '14px 16px',
        border: '1px solid #3d2f6e',
        borderLeft: '4px solid #a78bfa',
        borderRadius: 10,
        background: '#1a1a2e',
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: '#a78bfa',
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        🧠 Antes de falar com este lead
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map((item) => (
          <div
            key={item.label}
            style={{
              padding: '8px 10px',
              borderRadius: 7,
              background: '#23232b',
              border: '1px solid #2e2e42',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span
                  style={{
                    fontSize: 10,
                    opacity: 0.45,
                    textTransform: 'uppercase',
                    letterSpacing: 0.8,
                    display: 'block',
                    marginBottom: 3,
                  }}
                >
                  {item.icon} {item.label}
                </span>
                <div style={{ fontSize: 13, color: '#e5e7eb', lineHeight: 1.45 }}>
                  {item.content}
                </div>
              </div>
              {item.date && (
                <span
                  style={{
                    fontSize: 10,
                    opacity: 0.35,
                    flexShrink: 0,
                    paddingTop: 2,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {fmtDateShort(item.date)}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
