import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect } from 'next/navigation'
import type { CycleEvent, SalesCycle } from '@/app/types/sales_cycles'
import SalesCycleDetailClient from './SalesCycleDetailClient'

// ---------------------------------------------------------------------------
// Helpers de exibição — sem alterar persistência ou lógica de negócio
// ---------------------------------------------------------------------------

const STATUS_PT: Record<string, string> = {
  novo: 'NOVO',
  contato: 'CONTATO',
  respondeu: 'RESPONDEU',
  negociacao: 'NEGOCIAÇÃO',
  ganho: 'GANHO',
  perdido: 'PERDIDO',
}

function statusLabel(s: string | undefined | null): string {
  if (!s) return '—'
  return STATUS_PT[s.toLowerCase()] ?? s.toUpperCase()
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

const PAYMENT_TYPE_PT: Record<string, string> = {
  avista: 'À Vista',
  entrada_parcelas: 'Entrada + Parcelas',
  parcelado_sem_entrada: 'Parcelado (sem entrada)',
  recorrente: 'Recorrente',
  outro: 'Outro',
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

/** Extrai os campos do checkpoint do metadata, suportando ambos os formatos:
 *  - { checkpoint: { ... } }   ← rpc_move_cycle_stage_checkpoint
 *  - { metadata: { ... } }     ← rpc_move_cycle_stage (SalesCycleDetailClient)
 *  - campos planos no root      ← eventos antigos
 */
function extractCheckpoint(meta: Record<string, any>): Record<string, any> {
  if (meta.checkpoint && typeof meta.checkpoint === 'object') return meta.checkpoint
  if (meta.metadata && typeof meta.metadata === 'object') return meta.metadata
  // legado: campos planos no root (lead_events / eventos antigos)
  return meta
}

function EventDot({ color }: { color: string }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${color}`}
    />
  )
}

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null
  return (
    <div className="flex gap-2 text-xs">
      <span className="text-gray-500 flex-shrink-0">{label}:</span>
      <span className="text-gray-200">{value}</span>
    </div>
  )
}

/** Card para transições de checkpoint (stage_changed com destino intermediário) */
function CheckpointCard({ event }: { event: CycleEvent }) {
  const m = event.metadata ?? {}
  const cp = extractCheckpoint(m)
  const from = m.from_status as string | undefined
  const to = m.to_status as string | undefined

  const nextActionDate = cp.next_action_date
    ? (() => {
        const d = new Date(cp.next_action_date)
        return isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR')
      })()
    : null

  return (
    <div className="flex-1">
      <div className="flex justify-between items-start gap-2 flex-wrap">
        <p className="font-semibold text-white text-sm">
          {from || to ? (
            <>
              {statusLabel(from)}{' '}
              <span className="text-gray-400">→</span>{' '}
              {statusLabel(to)}
            </>
          ) : (
            'Movimentação'
          )}
        </p>
        <p className="text-xs text-gray-500 flex-shrink-0">{fmtDate(event.occurred_at)}</p>
      </div>

      {(cp.action_channel || cp.action_result || cp.result_detail || cp.next_action || cp.note) && (
        <div className="mt-2 space-y-1">
          <FieldRow label="Canal" value={cp.action_channel} />
          <FieldRow label="Resultado" value={cp.action_result} />
          {cp.result_detail && <FieldRow label="Detalhe" value={cp.result_detail} />}
          {cp.next_action && (
            <FieldRow
              label="Próxima ação"
              value={
                <>
                  {cp.next_action}
                  {nextActionDate && (
                    <span className="text-gray-500 ml-1">— {nextActionDate}</span>
                  )}
                </>
              }
            />
          )}
          {cp.note && <FieldRow label="Observação" value={<em>{cp.note}</em>} />}
        </div>
      )}
    </div>
  )
}

/** Card para eventos de perda (stage_changed com to_status = 'perdido') */
function LostCard({ event }: { event: CycleEvent }) {
  const m = event.metadata ?? {}
  const cp = extractCheckpoint(m)
  const from = m.from_status as string | undefined

  return (
    <div className="flex-1">
      <div className="flex justify-between items-start gap-2 flex-wrap">
        <p className="font-semibold text-red-400 text-sm">
          {from ? `${statusLabel(from)} → PERDIDO` : 'PERDIDO'}
        </p>
        <p className="text-xs text-gray-500 flex-shrink-0">{fmtDate(event.occurred_at)}</p>
      </div>
      <div className="mt-2 space-y-1">
        <FieldRow label="Canal" value={cp.action_channel} />
        <FieldRow label="Motivo da perda" value={
          cp.lost_reason
            ? <span className="text-red-300">{cp.lost_reason}</span>
            : null
        } />
        {cp.note && <FieldRow label="Observação" value={<em>{cp.note}</em>} />}
      </div>
    </div>
  )
}

/** Card sintético para ciclos ganhos (dados da tabela sales_cycles) */
function WonCard({ cycle }: { cycle: any }) {
  const payMethod = cycle.payment_method ? (PAYMENT_METHOD_PT[cycle.payment_method] ?? cycle.payment_method) : null
  const payType = cycle.payment_type ? (PAYMENT_TYPE_PT[cycle.payment_type] ?? cycle.payment_type) : null
  const productLabel = cycle.products?.name
    ? cycle.products.category
      ? `${cycle.products.name} (${cycle.products.category})`
      : cycle.products.name
    : null

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className="inline-block w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 bg-emerald-500" />
      </div>
      <div className="flex-1 pb-4 border-b border-gray-700">
        <div className="flex justify-between items-start gap-2 flex-wrap">
          <p className="font-semibold text-emerald-400 text-sm">
            {cycle.previous_status
              ? `${statusLabel(cycle.previous_status)} → GANHO`
              : 'GANHO'}
          </p>
          <p className="text-xs text-gray-500 flex-shrink-0">{fmtDate(cycle.won_at)}</p>
        </div>
        <div className="mt-2 space-y-1">
          {cycle.won_total != null && (
            <FieldRow label="Valor" value={
              <span className="text-emerald-300 font-semibold">{fmtCurrency(cycle.won_total)}</span>
            } />
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
    </div>
  )
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

/** Card genérico para eventos administrativos (assigned, returned_to_pool, etc.) */
function AdminCard({ event }: { event: CycleEvent }) {
  const m = event.metadata ?? {}
  const label = EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, ' ')

  return (
    <div className="flex-1">
      <div className="flex justify-between items-start gap-2 flex-wrap">
        <p className="font-medium text-gray-400 text-sm">{label}</p>
        <p className="text-xs text-gray-500 flex-shrink-0">{fmtDate(event.occurred_at)}</p>
      </div>
      {m.reason && (
        <div className="mt-1 text-xs text-gray-500">
          <span>Motivo: </span><em>{m.reason}</em>
        </div>
      )}
      {m.details && (
        <div className="mt-1 text-xs text-gray-500">
          <span>Detalhe: </span><em>{m.details}</em>
        </div>
      )}
    </div>
  )
}

function getEventTitle(event: CycleEvent): string {
  const m = event.metadata ?? {}
  const from = m.from_status as string | undefined
  const to = m.to_status as string | undefined
  if (from || to) {
    return `${from ? statusLabel(from) : '?'} → ${to ? statusLabel(to) : '?'}`
  }
  return EVENT_LABELS[event.event_type] ?? event.event_type.replace(/_/g, ' ')
}

/** Renderiza o conteúdo do card + cor do dot com base no tipo de evento */
function CycleEventCard({
  event,
  isLast,
}: {
  event: CycleEvent
  isLast: boolean
}) {
  const m = event.metadata ?? {}
  const toStatus = m.to_status as string | undefined

  const isLoss = event.event_type === 'stage_changed' && toStatus === 'perdido'
  const isTransition = event.event_type === 'stage_changed' && !isLoss

  const dotColor = isLoss
    ? 'bg-red-500'
    : toStatus === 'ganho'
    ? 'bg-emerald-500'
    : isTransition
    ? 'bg-blue-500'
    : 'bg-gray-600'

  return (
    <div className="flex gap-3 pb-4 border-b border-gray-700 last:border-b-0">
      <div className="flex flex-col items-center">
        <span className={`inline-block w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${dotColor}`} />
        {!isLast && <div className="w-px flex-1 bg-gray-700 mt-2 min-h-[1.5rem]" />}
      </div>

      {isLoss ? (
        <LostCard event={event} />
      ) : isTransition ? (
        <CheckpointCard event={event} />
      ) : (
        <AdminCard event={event} />
      )}
    </div>
  )
}

async function getSalesCycleDetail(cycleId: string) {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
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

  if (cycleErr || !cycleData) {
    redirect('/leads')
  }

  // Get events
  const { data: eventsData } = await supabase
    .from('cycle_events')
    .select('*')
    .eq('cycle_id', cycleId)
    .order('occurred_at', { ascending: false })

  return {
    cycle: cycleData as any,
    events: (eventsData || []) as CycleEvent[],
  }
}

export default async function SalesCycleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { cycle, events } = await getSalesCycleDetail(id)

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <div className="mb-6 flex justify-between items-start gap-4 flex-wrap">
        <div>
          <Link
            href="/leads"
            className="text-blue-400 hover:text-blue-300 text-sm mb-2 inline-block"
          >
            ← Voltar ao Pipeline
          </Link>
          <h1 className="text-3xl font-bold text-white">{cycle.leads?.name}</h1>
          <p className="text-gray-400 text-sm mt-1">Ciclo #{cycle.id}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main: Cycle details + Events */}
        <div className="lg:col-span-2">
          {/* Cycle info card */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-white mb-4">Informações</h2>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 uppercase">Lead</label>
                <p className="text-white font-semibold">{cycle.leads?.name}</p>
              </div>

              {cycle.leads?.phone && (
                <div>
                  <label className="text-xs text-gray-400 uppercase">Telefone</label>
                  <p className="text-white">{cycle.leads.phone}</p>
                </div>
              )}

              {cycle.leads?.email && (
                <div>
                  <label className="text-xs text-gray-400 uppercase">Email</label>
                  <p className="text-white">{cycle.leads.email}</p>
                </div>
              )}

              <div>
                <label className="text-xs text-gray-400 uppercase">Status</label>
                <p className="text-white font-semibold capitalize">{cycle.status}</p>
              </div>

              <div>
                <label className="text-xs text-gray-400 uppercase">
                  No status há
                </label>
                <p className="text-white">
                  {Math.floor(
                    (Date.now() -
                      new Date(cycle.stage_entered_at).getTime()) /
                      (1000 * 60 * 60 * 24)
                  )}{' '}
                  dia(s)
                </p>
              </div>

              {cycle.next_action && (
                <div>
                  <label className="text-xs text-gray-400 uppercase">
                    Próxima Ação
                  </label>
                  <p className="text-white">{cycle.next_action}</p>
                  {cycle.next_action_date && (
                    <p className="text-gray-400 text-sm mt-1">
                      {new Date(cycle.next_action_date).toLocaleString('pt-BR')}
                    </p>
                  )}
                </div>
              )}

              {cycle.closed_at && (
                <div>
                  <label className="text-xs text-gray-400 uppercase">
                    Fechado em
                  </label>
                  <p className="text-white">
                    {new Date(cycle.closed_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Timeline: Events */}
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-white mb-4">Histórico</h2>

            {/* Última movimentação */}
            {events.length > 0 && (
              <div className="mb-5 px-3 py-2 rounded-lg bg-gray-800 border border-gray-600 flex justify-between items-center gap-2 flex-wrap">
                <div>
                  <span className="text-xs text-gray-400 uppercase tracking-wide font-semibold">Última movimentação</span>
                  <p className="text-sm text-white font-medium mt-0.5">{getEventTitle(events[0])}</p>
                </div>
                <span className="text-xs text-gray-500 flex-shrink-0">{fmtDate(events[0].occurred_at)}</span>
              </div>
            )}

            {cycle.status === 'ganho' && cycle.won_at && (
              <WonCard cycle={cycle} />
            )}

            {events.length === 0 && cycle.status !== 'ganho' ? (
              <div className="text-center py-8 text-gray-500">
                Nenhum evento registrado
              </div>
            ) : (
              <div className="space-y-0">
                {events.map((event, index) => (
                  <CycleEventCard
                    key={event.id}
                    event={event}
                    isLast={index === events.length - 1}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Actions */}
        <div>
          <SalesCycleDetailClient cycle={cycle} />
        </div>
      </div>
    </div>
  )
}