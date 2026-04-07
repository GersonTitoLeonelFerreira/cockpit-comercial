import Link from 'next/link'
import type { ReactNode } from 'react'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import CycleOperationalSummary from './CycleOperationalSummary'
import CycleContextAlerts from './CycleContextAlerts'
import SalesCycleDetailClient from './SalesCycleDetailClient'

// ---------------------------------------------------------------------------
// Helpers de exibição
// ---------------------------------------------------------------------------

const STATUS_PT = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'RESPONDEU',
  negociacao: 'NEGOCIAÇÃO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
}

const PAYMENT_METHOD_PT = {
  pix: 'PIX', credito: 'Cartão de Crédito', debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência',
  misto: 'Misto', outro: 'Outro',
}
const PAYMENT_TYPE_PT = {
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
function extractCheckpoint(meta: Record<string, any>): Record<string, any> {
  if (meta.checkpoint && typeof meta.checkpoint === 'object') return meta.checkpoint
  if (meta.metadata && typeof meta.metadata === 'object') return meta.metadata
  return meta
}

// ---------------------------------------------------------------------------
// Cards para eventos do histórico
// ---------------------------------------------------------------------------

function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div style={{ fontSize: 13, marginBottom: 2 }}>
      <span style={{ color: '#888', marginRight: 4 }}>{label}:</span>
      <span style={{ color: '#fafafa' }}>{value}</span>
    </div>
  )
}

// Card para checkpoints intermediários
function CheckpointCard({ event }: { event: Record<string, any> }) {
  const m = event.metadata ?? {}
  const cp = extractCheckpoint(m)
  const from = m.from_status ?? event.from_stage
  const to = m.to_status ?? event.to_stage
  const nextActionDate = cp.next_action_date
    ? (() => {
      const d = new Date(cp.next_action_date)
      return isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR')
    })()
    : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, color: '#60a5fa' }}>
          {from || to ? (
            <>{statusLabel(from)} <span style={{ color: '#aaa' }}>→</span> {statusLabel(to)}</>
          ) : 'Movimentação'}
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(event.occurred_at)}</div>
      </div>
      {(cp.action_channel || cp.action_result || cp.result_detail || cp.next_action || cp.note) && (
        <div style={{ marginTop: 6 }}>
          <FieldRow label="Canal" value={cp.action_channel} />
          <FieldRow label="Resultado" value={cp.action_result} />
          {cp.result_detail && <FieldRow label="Detalhe" value={cp.result_detail} />}
          {cp.next_action && (
            <FieldRow
              label="Próxima ação"
              value={
                nextActionDate ? `${cp.next_action} — ${nextActionDate}` : cp.next_action
              }
            />
          )}
          {cp.note && <FieldRow label="Observação" value={<em>{cp.note}</em>} />}
        </div>
      )}
    </div>
  )
}

// Card para eventos de perda
function LostCard({ event }: { event: Record<string, any> }) {
  const m = event.metadata ?? {}
  const cp = extractCheckpoint(m)
  const from = m.from_status ?? event.from_stage
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, color: '#f87171' }}>
          {from ? `${statusLabel(from)} → PERDIDO` : 'PERDIDO'}
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(event.occurred_at)}</div>
      </div>
      <div style={{ marginTop: 6 }}>
        <FieldRow label="Canal" value={cp.action_channel} />
        {cp.lost_reason &&
          <FieldRow label="Motivo da perda" value={<span style={{ color: '#fca5a5' }}>{cp.lost_reason}</span>} />}
        {cp.note && <FieldRow label="Observação" value={<em>{cp.note}</em>} />}
      </div>
    </div>
  )
}

// Card para eventos de GANHO (usam o próprio ciclo)
function WonCard({ cycle }: { cycle: Record<string, any> }) {
  const payMethod = cycle.payment_method ? (PAYMENT_METHOD_PT[cycle.payment_method] ?? cycle.payment_method) : null
  const payType = cycle.payment_type ? (PAYMENT_TYPE_PT[cycle.payment_type] ?? cycle.payment_type) : null
  const productLabel = cycle.products?.name
    ? cycle.products.category
      ? `${cycle.products.name} (${cycle.products.category})`
      : cycle.products.name
    : null

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, color: '#34d399' }}>
          {cycle.previous_status ? `${statusLabel(cycle.previous_status)} → GANHO` : 'GANHO'}
        </div>
        <div style={{ fontSize: 12, color: '#888' }}>{fmtDate(cycle.won_at)}</div>
      </div>
      <div style={{ marginTop: 6 }}>
        {cycle.won_total != null && (
          <FieldRow label="Valor" value={<span style={{ color: '#6ee7b7', fontWeight: 700 }}>{fmtCurrency(cycle.won_total)}</span>} />
        )}
        {productLabel && <FieldRow label="Produto" value={productLabel} />}
        {payMethod && <FieldRow label="Meio de pagamento" value={payMethod} />}
        {payType && <FieldRow label="Negociação" value={payType} />}
        {cycle.installments_count > 0 && (
          <FieldRow label="Parcelas" value={`${cycle.installments_count}x${cycle.installment_amount ? ` de ${fmtCurrency(cycle.installment_amount)}` : ''}`} />
        )}
        {cycle.entry_amount > 0 && (
          <FieldRow label="Entrada" value={fmtCurrency(cycle.entry_amount)} />
        )}
        {cycle.payment_notes && <FieldRow label="Obs. pagamento" value={cycle.payment_notes} />}
        {cycle.won_note && <FieldRow label="Nota do fechamento" value={<em>{cycle.won_note}</em>} />}
      </div>
    </div>
  )
}

// Card para eventos administrativos/sem checkpoint
function AdminCard({ event }: { event: Record<string, any> }) {
  const m = event.metadata ?? {}
  const EVENT_LABELS = {
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
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <span style={{ color: '#aaa', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 12, color: '#888' }}>{fmtDate(event.occurred_at)}</span>
      </div>
      {m.reason && (
        <div style={{ marginTop: 2, color: '#888', fontSize: 13 }}>
          <span>Motivo: </span><em>{m.reason}</em>
        </div>
      )}
      {m.details && (
        <div style={{ marginTop: 2, color: '#888', fontSize: 13 }}>
          <span>Detalhe: </span><em>{m.details}</em>
        </div>
      )}
    </div>
  )
}

function getEventTitle(event: Record<string, any>): string {
  const m = event.metadata ?? {}
  const from = m.from_status ?? event.from_stage
  const to = m.to_status ?? event.to_stage
  if (from || to) {
    return `${from ? statusLabel(from) : '?'} → ${to ? statusLabel(to) : '?'}`
  }
  const EVENT_LABELS = {
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
// Busca dos dados
// ---------------------------------------------------------------------------

async function getSalesCycleDetail(cycleId: string) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
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
// Página de detalhe do ciclo (Histórico operacional Fase 1.4)
// ---------------------------------------------------------------------------

export default async function SalesCycleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { cycle, events } = await getSalesCycleDetail(id)

  return (
    <div style={{ minHeight: '100vh', background: '#18181b', padding: 24 }}>
      {/* Header */}
      <div style={{ marginBottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
        <div>
          <Link href="/leads" style={{ color: '#60a5fa', fontSize: 15, textDecoration: 'none', fontWeight: 600 }}>
            ← Voltar ao Pipeline
          </Link>
          <h1 style={{ color: 'white', fontWeight: 700, fontSize: '1.9rem', margin: 0 }}>{cycle.leads?.name}</h1>
          <p style={{ color: '#94a3b8', fontSize: 15, margin: 0, marginTop: 5 }}>Ciclo #{cycle.id}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 32 }}>
        {/* Main: Detalhes + Histórico */}
        <div>
          {/* Card infos do ciclo */}
          <div style={{ background: '#23232b', border: '1px solid #313145', borderRadius: 16, padding: 24, marginBottom: 28 }}>
            <h2 style={{ color: 'white', fontWeight: 700, fontSize: 20, margin: 0, marginBottom: 10 }}>Informações</h2>
            <div style={{ marginBottom: 6 }}>
              <strong style={{ color: '#8b8fa2', fontWeight: 500, fontSize: 13 }}>Lead:</strong>
              <span style={{ color: 'white', fontWeight: 500, marginLeft: 6 }}>{cycle.leads?.name}</span>
            </div>
            {cycle.leads?.phone && (
              <div style={{ color: 'white', fontSize: 14 }}><span style={{ color: '#8b8fa2' }}>Telefone:</span> {cycle.leads.phone}</div>
            )}
            {cycle.leads?.email && (
              <div style={{ color: 'white', fontSize: 14 }}><span style={{ color: '#8b8fa2' }}>Email:</span> {cycle.leads.email}</div>
            )}
            <div style={{ color: 'white', fontSize: 14 }}><span style={{ color: '#8b8fa2' }}>Status:</span> <span style={{ fontWeight: 500 }}>{cycle.status}</span></div>
            <div style={{ color: 'white', fontSize: 14 }}>
              <span style={{ color: '#8b8fa2' }}>No status há:</span> {
                Math.floor((Date.now() - new Date(cycle.stage_entered_at).getTime()) / (1000 * 60 * 60 * 24))
              } dia(s)
            </div>
            {cycle.next_action && (
              <div style={{ color: 'white', fontSize: 14 }}><span style={{ color: '#8b8fa2' }}>Próxima Ação:</span> {cycle.next_action} {cycle.next_action_date && <span style={{ color: '#94a3b8', fontSize: 12 }}>({fmtDate(cycle.next_action_date)})</span>}</div>
            )}
            {cycle.closed_at && (
              <div style={{ color: 'white', fontSize: 14 }}><span style={{ color: '#8b8fa2' }}>Fechado em:</span> {fmtDate(cycle.closed_at)}</div>
            )}
          </div>

          {/* Resumo Operacional + Alertas */}
          <CycleOperationalSummary events={events} ciclo={cycle} />
          <CycleContextAlerts
            events={events}
            lead={{
              status: cycle.status,
              next_action: cycle.next_action,
              next_action_date: cycle.next_action_date,
            }}
          />

          {/* Timeline: Histórico */}
          <div style={{ background: '#23232b', border: '1px solid #313145', borderRadius: 16, padding: 24 }}>
            <h2 style={{ color: 'white', fontWeight: 700, fontSize: 20, margin: 0, marginBottom: 18 }}>Histórico</h2>
            {/* Última movimentação */}
            {events.length > 0 && (
              <div style={{
                marginBottom: 18, background: '#212134', border: '1px solid #343458',
                borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 12px', flexWrap: 'wrap'
              }}>
                <div>
                  <span style={{ fontSize: 11, color: '#aaa', textTransform: 'uppercase', letterSpacing: 1 }}>Última movimentação</span>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#e5e7eb', marginTop: 2 }}>{getEventTitle(events[0])}</div>
                </div>
                <span style={{ fontSize: 12, color: '#888' }}>{fmtDate(events[0].occurred_at)}</span>
              </div>
            )}
            {/* Exibição de ganho (aparece antes da timeline se ciclo está ganho!) */}
            {cycle.status === 'ganho' && cycle.won_at && (
              <div style={{
                marginBottom: 12, background: '#101825',
                borderLeft: '5px solid #22c55e',
                borderRadius: 8, padding: 14
              }}>
                <WonCard cycle={cycle} />
              </div>
            )}
            {events.length === 0 && cycle.status !== 'ganho' ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#6b7280' }}>
                Nenhum evento registrado
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {events.map((event, idx) => {
                  const m = event.metadata ?? {}
                  const toStatus = m.to_status ?? event.to_stage ?? ''
                  const isLoss = event.event_type === 'stage_changed' && String(toStatus).toLowerCase() === 'perdido'
                  const isTransition = event.event_type === 'stage_changed' && !isLoss

                  return (
                    <div
                      key={event.id}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'start'
                      }}
                    >
                      {/* Timeline dot */}
                      <div style={{
                        width: 12, height: 12, borderRadius: '50%', marginTop: 6,
                        background: isLoss ? '#ef4444' : isTransition ? '#60a5fa' : '#888', flexShrink: 0
                      }} />
                      <div style={{
                        flex: 1,
                        background: '#181824',
                        borderRadius: 8,
                        border: '1px solid #25253b',
                        padding: '14px 16px'
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

        {/* Sidebar: ações do ciclo */}
        <div>
          <SalesCycleDetailClient cycle={cycle} />
        </div>
      </div>
    </div>
  )
}