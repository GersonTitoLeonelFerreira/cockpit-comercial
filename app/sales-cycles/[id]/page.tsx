import Link from 'next/link'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import CycleOperationalSummary from './CycleOperationalSummary'
import CycleContextAlerts from './CycleContextAlerts'

// ---------------------------------------------------------------------------
// Helpers de exibição
// ---------------------------------------------------------------------------

const STATUS_PT: Record<string, string> = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'RESPONDEU',
  negociacao: 'NEGOCIAÇÃO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
}

const PAYMENT_METHOD_PT: Record<string, string> = {
  pix: 'PIX', credito: 'Cartão de Crédito', debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência',
  misto: 'Misto', outro: 'Outro',
}
const PAYMENT_TYPE_PT: Record<string, string> = {
  avista: 'À Vista', entrada_parcelas: 'Entrada + Parcelas',
  parcelado_sem_entrada: 'Parcelado (sem entrada)',
  recorrente: 'Recorrente', outro: 'Outro',
}

function statusLabel(s: string | null | undefined): string {
  if (!s) return '—'
  return STATUS_PT[String(s).toLowerCase()] ?? String(s).toUpperCase()
}
function fmtCurrency(v: number | null | undefined): string {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function fmtDate(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR')
}
function fmtDateShort(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('pt-BR')
}
function extractCheckpoint(meta: Record<string, unknown>): Record<string, unknown> {
  if (meta.checkpoint && typeof meta.checkpoint === 'object') return meta.checkpoint as Record<string, unknown>
  if (meta.metadata && typeof meta.metadata === 'object') return meta.metadata as Record<string, unknown>
  return meta
}
function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const clean = phone.replace(/\D/g, '')
  if (!clean) return null
  return `https://wa.me/${clean.startsWith('55') ? clean : '55' + clean}`
}

// ---------------------------------------------------------------------------
// Status badge styles
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, { background: string; color: string }> = {
  novo:       { background: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  contato:    { background: 'rgba(96,165,250,0.15)',  color: '#60a5fa' },
  respondeu:  { background: 'rgba(168,85,247,0.15)',  color: '#a855f7' },
  negociacao: { background: 'rgba(253,224,138,0.15)', color: '#fde68a' },
  ganho:      { background: 'rgba(52,211,153,0.15)',  color: '#34d399' },
  perdido:    { background: 'rgba(248,113,113,0.15)', color: '#f87171' },
}

function statusBadgeStyle(s: string | null | undefined): { background: string; color: string } {
  const key = (s ?? '').toLowerCase()
  return STATUS_BADGE[key] ?? { background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }
}

// ---------------------------------------------------------------------------
// Cards para eventos do histórico
// ---------------------------------------------------------------------------

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div style={{ fontSize: 13, marginBottom: 4 }}>
      <span style={{ color: '#8b8fa2', marginRight: 6 }}>{label}:</span>
      <span style={{ color: '#f1f5f9' }}>{value}</span>
    </div>
  )
}

// Card para checkpoints intermediários
function CheckpointCard({ event }: { event: Record<string, unknown> }) {
  const m = (event.metadata as Record<string, unknown>) ?? {}
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
        <div style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at as string)}</div>
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

// Card para eventos de perda
function LostCard({ event }: { event: Record<string, unknown> }) {
  const m = (event.metadata as Record<string, unknown>) ?? {}
  const cp = extractCheckpoint(m)
  const from = (m.from_status as string) ?? (event.from_stage as string)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontWeight: 700, color: '#f87171' }}>
          {from ? `${statusLabel(from)} → PERDIDO` : 'PERDIDO'}
        </div>
        <div style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at as string)}</div>
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

// Card para eventos de GANHO (usam o próprio ciclo)
function WonCard({ cycle }: { cycle: Record<string, unknown> }) {
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

// Card para eventos administrativos/sem checkpoint
function AdminCard({ event }: { event: Record<string, unknown> }) {
  const m = (event.metadata as Record<string, unknown>) ?? {}
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
  const label = EVENT_LABELS[event.event_type as string] ?? (event.event_type as string).replace(/_/g, ' ')
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <span style={{ color: '#8b8fa2', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: '#8b8fa2' }}>{fmtDate(event.occurred_at as string)}</span>
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

function getEventTitle(event: Record<string, unknown>): string {
  const m = (event.metadata as Record<string, unknown>) ?? {}
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
  return EVENT_LABELS[event.event_type as string] ?? (event.event_type as string).replace(/_/g, ' ')
}

// ---------------------------------------------------------------------------
// Busca dos dados
// ---------------------------------------------------------------------------

async function getSalesCycleDetail(cycleId: string) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll() {},
      },
    }
  )

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user) redirect('/login')

  // Get cycle with lead data
  const { data: cycleData, error: cycleErr } = await supabase
    .from('sales_cycles')
    .select(`
      *,
      leads:lead_id (id, name, phone, email),
      products:product_id (id, name, category)
    `)
    .eq('id', cycleId)
    .single()

  if (cycleErr || !cycleData) redirect('/leads')

  // Get events
  const { data: eventsData } = await supabase
    .from('cycle_events')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('occurred_at', { ascending: false })

  return {
    cycle: cycleData,
    events: (eventsData || []),
  }
}

// ---------------------------------------------------------------------------
// Página de detalhe do ciclo — Layout executivo premium
// ---------------------------------------------------------------------------

export default async function SalesCycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cycle, events } = await getSalesCycleDetail(id)

  const lead = cycle.leads as { name?: string; phone?: string; email?: string } | null
  const daysInStatus = cycle.stage_entered_at
    ? Math.floor((Date.now() - new Date(cycle.stage_entered_at as string).getTime()) / (1000 * 60 * 60 * 24))
    : null
  const lastEvent = events.length > 0 ? events[0] : null
  const badgeStyle = statusBadgeStyle(cycle.status as string)
  const waLink = whatsappLink(lead?.phone)

  // Next action badge
  let nextActionBadge: { label: string; color: string } | null = null
  if (cycle.next_action_date) {
    const d = new Date(cycle.next_action_date as string)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    const isPast = d < now && !isToday
    if (isPast) nextActionBadge = { label: 'Vencida', color: '#f87171' }
    else if (isToday) nextActionBadge = { label: 'Hoje', color: '#fde68a' }
    else nextActionBadge = { label: 'Futura', color: '#60a5fa' }
  }

  // Next action card left border color
  let nextActionBorderColor = '#4b5563'
  if (cycle.next_action_date) {
    const d = new Date(cycle.next_action_date as string)
    const now = new Date()
    const isToday = d.toDateString() === now.toDateString()
    if (d < now && !isToday) nextActionBorderColor = '#f87171'
    else if (isToday) nextActionBorderColor = '#fde68a'
    else nextActionBorderColor = '#60a5fa'
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f0f14', padding: '24px 28px' }}>

      {/* ── 1. HEADER EXECUTIVO ─────────────────────────────────────────────── */}
      <div style={{
        background: '#1e1e2e',
        border: '1px solid #2a2a3e',
        borderRadius: 16,
        padding: '20px 28px',
        marginBottom: 20,
      }}>
        <Link
          href="/leads"
          style={{ color: '#60a5fa', fontSize: 13, textDecoration: 'none', fontWeight: 500, display: 'inline-block', marginBottom: 8, opacity: 0.8 }}
        >
          ← Voltar ao Pipeline
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <h1 style={{ color: '#f1f5f9', fontWeight: 800, fontSize: '1.8rem', margin: 0, lineHeight: 1.1 }}>
            {lead?.name ?? '—'}
          </h1>
          {/* Status badge */}
          <span style={{
            ...badgeStyle,
            borderRadius: 20,
            padding: '4px 12px',
            fontSize: 12,
            fontWeight: 600,
          }}>
            {statusLabel(cycle.status as string)}
          </span>
          {/* WhatsApp link */}
          {lead?.phone && (
            waLink ? (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#34d399',
                  fontSize: 13,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  background: 'rgba(52,211,153,0.10)',
                  border: '1px solid rgba(52,211,153,0.25)',
                  borderRadius: 20,
                  padding: '4px 12px',
                  fontWeight: 500,
                }}
              >
                📱 {lead.phone}
              </a>
            ) : (
              <span style={{ color: '#8b8fa2', fontSize: 13 }}>{lead.phone}</span>
            )
          )}
        </div>
        <p style={{ color: '#8b8fa2', fontSize: 12, margin: 0, marginTop: 6 }}>
          Ciclo <span style={{ fontFamily: 'monospace' }}>#{cycle.id as string}</span>
        </p>
      </div>

      {/* ── 2. MINI-CARDS DE CONTEXTO RÁPIDO ───────────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 24,
      }}>
        {/* Status */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Status</div>
          <span style={{
            ...badgeStyle,
            borderRadius: 20,
            padding: '3px 10px',
            fontSize: 11,
            fontWeight: 600,
          }}>
            {statusLabel(cycle.status as string)}
          </span>
        </div>

        {/* Tempo parado */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Tempo parado</div>
          <div style={{
            fontSize: 16,
            fontWeight: 700,
            color: daysInStatus != null && daysInStatus > 7 ? '#f87171' : '#f1f5f9',
          }}>
            {daysInStatus != null ? `${daysInStatus} dia${daysInStatus !== 1 ? 's' : ''}` : '—'}
          </div>
        </div>

        {/* Próxima ação */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Próxima ação</div>
          {cycle.next_action ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#fde68a', marginBottom: 2 }}>{cycle.next_action as string}</div>
              {cycle.next_action_date && (
                <div style={{ fontSize: 11, color: '#8b8fa2' }}>{fmtDateShort(cycle.next_action_date as string)}</div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#fde68a', opacity: 0.7 }}>Sem ação definida</div>
          )}
        </div>

        {/* Última movimentação */}
        <div style={{
          background: '#1e1e2e',
          border: '1px solid #2a2a3e',
          borderRadius: 12,
          padding: '12px 16px',
        }}>
          <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Última movimentação</div>
          {lastEvent ? (
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9' }}>{getEventTitle(lastEvent as Record<string, unknown>)}</div>
              <div style={{ fontSize: 11, color: '#8b8fa2', marginTop: 2 }}>{fmtDateShort((lastEvent as Record<string, unknown>).occurred_at as string)}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: '#8b8fa2' }}>Sem movimentação</div>
          )}
        </div>
      </div>

      {/* ── 3. CORPO EM 2 COLUNAS ───────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24 }}>

        {/* COLUNA ESQUERDA */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Resumo Operacional */}
          <CycleOperationalSummary events={events} ciclo={cycle} />

          {/* Histórico / Timeline */}
          <div style={{
            background: '#1e1e2e',
            border: '1px solid #2a2a3e',
            borderRadius: 16,
            padding: 24,
          }}>
            <h2 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16, margin: 0, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Histórico
            </h2>

            {/* Bloco de GANHO — aparece antes da timeline se ciclo ganho */}
            {cycle.status === 'ganho' && cycle.won_at && (
              <div style={{
                marginBottom: 20,
                background: '#181824',
                borderLeft: '4px solid #34d399',
                borderRadius: 8,
                padding: '14px 16px',
              }}>
                <WonCard cycle={cycle as Record<string, unknown>} />
              </div>
            )}

            {events.length === 0 && cycle.status !== 'ganho' ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#8b8fa2' }}>
                Nenhum evento registrado
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {(events as Record<string, unknown>[]).map((event) => {
                  const m = (event.metadata as Record<string, unknown>) ?? {}
                  const toStatus = (m.to_status as string) ?? (event.to_stage as string) ?? ''
                  const isLoss = event.event_type === 'stage_changed' && String(toStatus).toLowerCase() === 'perdido'
                  const isTransition = event.event_type === 'stage_changed' && !isLoss

                  return (
                    <div
                      key={event.id as string}
                      style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}
                    >
                      {/* Timeline dot */}
                      <div style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        marginTop: 7,
                        flexShrink: 0,
                        background: isLoss ? '#f87171' : isTransition ? '#60a5fa' : '#4b5563',
                      }} />
                      <div style={{
                        flex: 1,
                        background: '#181824',
                        borderRadius: 10,
                        border: '1px solid #2a2a3e',
                        padding: '14px 16px',
                      }}>
                        {isLoss
                          ? <LostCard event={event} />
                          : isTransition
                            ? <CheckpointCard event={event} />
                            : <AdminCard event={event} />
                        }
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* COLUNA DIREITA (sidebar) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Próxima Ação */}
          <div style={{
            background: '#1e1e2e',
            border: '1px solid #2a2a3e',
            borderLeft: `4px solid ${nextActionBorderColor}`,
            borderRadius: 12,
            padding: '16px 18px',
          }}>
            <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              Próxima Ação
            </div>
            {cycle.next_action ? (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fde68a', marginBottom: 6, lineHeight: 1.4 }}>
                  {cycle.next_action as string}
                </div>
                {cycle.next_action_date && (
                  <div style={{ fontSize: 12, color: '#8b8fa2', marginBottom: 8 }}>
                    {fmtDate(cycle.next_action_date as string)}
                  </div>
                )}
                {nextActionBadge && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: nextActionBadge.color,
                    background: `${nextActionBadge.color}22`,
                    border: `1px solid ${nextActionBadge.color}44`,
                    borderRadius: 20,
                    padding: '2px 10px',
                  }}>
                    {nextActionBadge.label}
                  </span>
                )}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: '#fde68a', opacity: 0.6 }}>
                Nenhuma ação definida
              </div>
            )}
          </div>

          {/* Alertas */}
          <CycleContextAlerts
            events={events}
            lead={{
              status: cycle.status as string,
              next_action: cycle.next_action as string | null,
              next_action_date: cycle.next_action_date as string | null,
            }}
          />

          {/* Informações do Lead */}
          <div style={{
            background: '#1e1e2e',
            border: '1px solid #2a2a3e',
            borderRadius: 12,
            padding: '16px 18px',
          }}>
            <div style={{ fontSize: 10, color: '#8b8fa2', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
              Informações do Lead
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#8b8fa2' }}>Lead</span>
                <span style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 500, textAlign: 'right' }}>{lead?.name ?? '—'}</span>
              </div>
              {lead?.phone && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8b8fa2' }}>Telefone</span>
                  {waLink ? (
                    <a href={waLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#34d399', textDecoration: 'none', textAlign: 'right' }}>
                      {lead.phone}
                    </a>
                  ) : (
                    <span style={{ fontSize: 12, color: '#f1f5f9', textAlign: 'right' }}>{lead.phone}</span>
                  )}
                </div>
              )}
              {lead?.email && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8b8fa2' }}>Email</span>
                  <span style={{ fontSize: 12, color: '#f1f5f9', textAlign: 'right', wordBreak: 'break-all' }}>{lead.email}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#8b8fa2' }}>Status</span>
                <span style={{
                  ...badgeStyle,
                  fontSize: 11,
                  fontWeight: 600,
                  borderRadius: 20,
                  padding: '2px 8px',
                }}>
                  {statusLabel(cycle.status as string)}
                </span>
              </div>
              {daysInStatus != null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8b8fa2' }}>Tempo no status</span>
                  <span style={{
                    fontSize: 12,
                    color: daysInStatus > 7 ? '#f87171' : '#f1f5f9',
                    fontWeight: daysInStatus > 7 ? 600 : 400,
                  }}>
                    {daysInStatus} dia{daysInStatus !== 1 ? 's' : ''}
                  </span>
                </div>
              )}
              {cycle.closed_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <span style={{ fontSize: 12, color: '#8b8fa2' }}>Fechado em</span>
                  <span style={{ fontSize: 12, color: '#f1f5f9', textAlign: 'right' }}>{fmtDateShort(cycle.closed_at as string)}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}