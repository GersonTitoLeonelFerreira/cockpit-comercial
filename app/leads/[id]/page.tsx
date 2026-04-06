import LeadOperationalSummary from './LeadOperationalSummary'
import LeadContextAlerts from './LeadContextAlerts'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect, notFound } from 'next/navigation'
import AddInteraction from './AddInteraction'
import NextContactForm from './NextContactForm'
import LeadActions from './LeadActions'
import LeadProfileTabs from './LeadProfileTabs'
import LeadAIBoxClient from './LeadAIBoxClient'

const LEAD_STATUS_PT = {
  novo: 'NOVO', contato: 'CONTATO', respondeu: 'RESPONDEU',
  negociacao: 'NEGOCIAÇÃO', ganho: 'GANHO', perdido: 'PERDIDO',
}
const LEAD_EVENT_LABELS = {
  stage_changed: 'Movimentação', contacted: 'Contato registrado',
  replied: 'Resposta registrada', note_added: 'Nota adicionada',
  next_action_set: 'Próxima ação definida', assigned: 'Ciclo atribuído',
  reassigned: 'Ciclo reatribuído', returned_to_pool: 'Devolvido ao pool',
  cycle_created: 'Ciclo criado', owner_assigned: 'Proprietário atribuído',
}
const LEAD_PAYMENT_METHOD_PT = {
  pix: 'PIX', credito: 'Cartão de Crédito', debito: 'Cartão de Débito',
  dinheiro: 'Dinheiro', boleto: 'Boleto', transferencia: 'Transferência',
  misto: 'Misto', outro: 'Outro',
}
const LEAD_PAYMENT_TYPE_PT = {
  avista: 'À Vista', entrada_parcelas: 'Entrada + Parcelas',
  parcelado_sem_entrada: 'Parcelado (sem entrada)',
  recorrente: 'Recorrente', outro: 'Outro',
}
function fmtLeadCurrency(v: number | null | undefined) {
  if (v == null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
function stageLabel(s: string | null | undefined) {
  if (!s) return '—'
  return LEAD_STATUS_PT[s.toLowerCase() as keyof typeof LEAD_STATUS_PT] ?? s.toUpperCase()
}
function onlyDigits(v: string | null | undefined) {
  return (v || '').replace(/\D/g, '')
}
function whatsappLink(phone: string | null | undefined) {
  const digits = onlyDigits(phone ?? '')
  if (!digits) return null
  const full = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${full}`
}
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default async function LeadDetailPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const leadId = params?.id

  if (!leadId || leadId === 'undefined') redirect('/leads')
  if (!UUID_RE.test(leadId)) notFound()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          const store = await cookies()
          return store.getAll()
        },
        async setAll() {},
      },
    }
  )

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()
  if (userErr || !user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()
  if (profileError || !profile?.company_id) {
    return (
      <div style={{ width: 900, margin: '80px auto', color: 'white' }}>
        <h1>Lead</h1>
        <p>Erro ao buscar company_id do usuário: {profileError?.message ?? 'company_id ausente'}</p>
      </div>
    )
  }
  const companyId = profile.company_id
  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, name, phone, status, created_at, next_action, next_contact_at, company_id')
    .eq('id', leadId)
    .eq('company_id', companyId)
    .single()
  if (leadError || !lead) {
    return (
      <div style={{ width: 900, margin: '80px auto', color: 'white' }}>
        <h1>Lead não encontrado</h1>
        <p>{leadError?.message ?? 'Sem acesso, lead inexistente ou fora da sua empresa.'}</p>
      </div>
    )
  }
  const { data: leadProfile } = await supabase
    .from('lead_profiles')
    .select('*')
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .maybeSingle()

  const { data: interactions, error: interError } = await supabase
    .from('lead_interactions')
    .select('id, type, note, created_at')
    .eq('lead_id', leadId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  const { data: events, error: eventsErr } = await supabase
    .from('lead_events')
    .select('id, event_type, from_stage, to_stage, created_at, metadata')
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(80)

  const { data: leadCycle } = await supabase
    .from('sales_cycles')
    .select('*, products:product_id (id, name, category)')
    .eq('lead_id', leadId)
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const wa = whatsappLink(lead.phone)

  return (
    <div style={{ width: 980, margin: '60px auto', color: 'white' }}>
      <a href="/leads" style={{ color: '#9aa', textDecoration: 'none' }}>
        ← Voltar
      </a>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'baseline' }}>
        <h1 style={{ marginTop: 16, marginBottom: 6 }}>{lead.name}</h1>
        <LeadActions leadId={lead.id} companyId={companyId} userId={user.id} currentStatus={lead.status} phone={lead.phone} />
      </div>
      {/* --------- BLOCO DE RESUMO OPERACIONAL --------- */}
      <LeadOperationalSummary events={events || []} ciclo={leadCycle ?? {}} />
      {/* ---------------------------------------------- */}
      <LeadContextAlerts
        events={events || []}
        lead={{
          status: lead.status,
          next_action: lead.next_action,
          next_contact_at: lead.next_contact_at,
          created_at: lead.created_at,
        }}
      />
      <div style={{ opacity: 0.9, marginTop: 8 }}>
        <div>
          <strong>Telefone:</strong> {lead.phone ?? '—'}
          {wa && (
            <> • <a href={wa} target="_blank" rel="noreferrer" style={{ color: '#9aa', textDecoration: 'none' }}>WhatsApp →</a></>
          )}
        </div>
        <div>
          <strong>Status:</strong> {stageLabel(lead.status)}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Criado em: {lead.created_at}</div>
      </div>
      <LeadAIBoxClient
        lead={{
          id: lead.id,
          company_id: companyId,
          name: lead.name,
          phone: lead.phone,
          status: lead.status,
        }}
      />
      <LeadProfileTabs leadId={leadId} companyId={companyId} initialProfile={leadProfile ?? null} />
      <div style={{ marginTop: 24, padding: 16, border: '1px solid #333', borderRadius: 10, background: '#0f0f0f' }}>
        <h3 style={{ marginTop: 0 }}>Adicionar interação</h3>
        <AddInteraction leadId={leadId} userId={user.id} />
      </div>
      <div style={{ marginTop: 18, padding: 16, border: '1px solid #333', borderRadius: 10, background: '#0f0f0f' }}>
        <h3 style={{ marginTop: 0 }}>Próximo contato</h3>
        <div style={{ opacity: 0.75, fontSize: 12, marginBottom: 10 }}>
          Defina a próxima ação e a data/hora. Isso alimenta a página /agenda.
        </div>
        <NextContactForm leadId={leadId} initialAction={lead.next_action} initialNextContactAt={lead.next_contact_at} />
      </div>
      <div style={{ marginTop: 18, padding: 16, border: '1px solid #333', borderRadius: 10, background: '#0f0f0f' }}>
        <h3 style={{ marginTop: 0 }}>Timeline do Lead</h3>
        <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 10 }}>
          Movimentações do funil (lead_events) + suas interações (lead_interactions).
        </div>
        {eventsErr ? <p>Erro ao buscar eventos: {eventsErr.message}</p> : null}
        {interError ? <p>Erro ao buscar interações: {interError.message}</p> : null}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
            <b>Movimentações do funil</b>
          </div>
          {events && events.length > 0 && (() => {
            const last = events[0] || {}
            const m = (last.metadata ?? {}) as Record<string, unknown>
            const fromStage = last.from_stage ?? m.from_status
            const toStage = last.to_stage ?? m.to_status
            const title = fromStage && toStage
              ? `${stageLabel(fromStage as string)} → ${stageLabel(toStage as string)}`
              : LEAD_EVENT_LABELS[last.event_type as keyof typeof LEAD_EVENT_LABELS] ?? String(last.event_type).replace(/_/g, ' ')
            const dateStr = last.created_at ? new Date(last.created_at).toLocaleString('pt-BR') : '—'
            return (
              <div style={{ marginBottom: 14, padding: '8px 12px', borderRadius: 8, background: '#161616', border: '1px solid #2a2a2a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <span style={{ fontSize: 10, opacity: 0.5, textTransform: 'uppercase', letterSpacing: 1 }}>Última movimentação</span>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb', marginTop: 2 }}>{title}</div>
                </div>
                <span style={{ fontSize: 11, opacity: 0.5, flexShrink: 0 }}>{dateStr}</span>
              </div>
            )
          })()}
          {!events || events.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Nenhum evento ainda (mova no Kanban para gerar).</div>
          ) : (
            events.map(ev => {
              const m = (ev.metadata ?? {}) as Record<string, unknown>
              const cp = (m.checkpoint || m.metadata || m) as Record<string, any>
              const fromStage = ev.from_stage ?? (m.from_status as string)
              const toStage = ev.to_stage ?? (m.to_status as string)
              const isLoss = toStage && String(toStage).toLowerCase() === 'perdido'
              const isWon = toStage && String(toStage).toLowerCase() === 'ganho'
              const accentColor = isLoss ? '#fca5a5' : isWon ? '#86efac' : '#93c5fd'
              const dotBg = isLoss ? '#ef4444' : isWon ? '#10b981' : '#3b82f6'
              const dateLabel = ev.created_at
                ? new Date(ev.created_at).toLocaleString('pt-BR')
                : '—'
              const nextActionDate = cp.next_action_date
                ? (() => {
                  const d = new Date(cp.next_action_date as string)
                  return isNaN(d.getTime()) ? null : d.toLocaleString('pt-BR')
                })()
                : null
              const eventTitle = fromStage && toStage
                ? `${stageLabel(fromStage)} → ${stageLabel(toStage)}`
                : LEAD_EVENT_LABELS[ev.event_type as keyof typeof LEAD_EVENT_LABELS] ?? String(ev.event_type).replace(/_/g, ' ')
              const hasCheckpointFields = cp.action_channel || cp.action_result || cp.result_detail || cp.next_action || cp.note
              const hasLossFields = cp.lost_reason || cp.action_channel
              const hasWonCycleData = isWon && leadCycle && leadCycle.status === 'ganho'
              return (
                <div key={ev.id} style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: '50%', marginTop: 4,
                    backgroundColor: dotBg, flexShrink: 0
                  }} />
                  <div style={{
                    flex: 1,
                    padding: '10px 12px',
                    border: `1px solid ${isLoss ? '#3f1c1c' : isWon ? '#1a3a28' : '#222'}`,
                    borderRadius: 10,
                    background: '#111',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: 13, color: accentColor }}>{eventTitle}</strong>
                      <span style={{ opacity: 0.6, fontSize: 12 }}>{dateLabel}</span>
                    </div>
                    {hasWonCycleData && (
                      <div style={{ marginTop: 8, display: 'grid', gap: 3, fontSize: 12 }}>
                        {leadCycle.won_total != null && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Valor: </span>
                            <span style={{ color: '#86efac', fontWeight: 700 }}>{fmtLeadCurrency(leadCycle.won_total)}</span>
                          </div>
                        )}
                        {leadCycle.products?.name && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Produto: </span>
                            <span>{leadCycle.products.category ? `${leadCycle.products.name} (${leadCycle.products.category})` : leadCycle.products.name}</span>
                          </div>
                        )}
                        {leadCycle.payment_method && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Meio de pagamento: </span>
                            <span>{LEAD_PAYMENT_METHOD_PT[leadCycle.payment_method as keyof typeof LEAD_PAYMENT_METHOD_PT] ?? leadCycle.payment_method}</span>
                          </div>
                        )}
                        {leadCycle.payment_type && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Negociação: </span>
                            <span>{LEAD_PAYMENT_TYPE_PT[leadCycle.payment_type as keyof typeof LEAD_PAYMENT_TYPE_PT] ?? leadCycle.payment_type}</span>
                          </div>
                        )}
                        {leadCycle.installments_count > 0 && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Parcelas: </span>
                            <span>{leadCycle.installments_count}x{leadCycle.installment_amount ? ` de ${fmtLeadCurrency(leadCycle.installment_amount)}` : ''}</span>
                          </div>
                        )}
                        {leadCycle.entry_amount > 0 && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Entrada: </span>
                            <span>{fmtLeadCurrency(leadCycle.entry_amount)}</span>
                          </div>
                        )}
                        {leadCycle.payment_notes && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Obs. pagamento: </span>
                            <span>{leadCycle.payment_notes}</span>
                          </div>
                        )}
                        {leadCycle.won_note && (
                          <div style={{ marginTop: 4, borderTop: '1px solid #1e1e1e', paddingTop: 4 }}>
                            <span style={{ opacity: 0.55 }}>Nota do fechamento: </span>
                            <em style={{ opacity: 0.85 }}>{leadCycle.won_note}</em>
                          </div>
                        )}
                      </div>
                    )}
                    {isLoss && hasLossFields && (
                      <div style={{ marginTop: 8, display: 'grid', gap: 3, fontSize: 12 }}>
                        {cp.action_channel && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Canal: </span>
                            <span>{String(cp.action_channel)}</span>
                          </div>
                        )}
                        {cp.lost_reason && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Motivo da perda: </span>
                            <span style={{ color: '#fca5a5' }}>{String(cp.lost_reason)}</span>
                          </div>
                        )}
                        {cp.note && (
                          <div style={{ marginTop: 4, borderTop: '1px solid #1e1e1e', paddingTop: 4 }}>
                            <span style={{ opacity: 0.55 }}>Observação: </span>
                            <em style={{ opacity: 0.85 }}>{String(cp.note)}</em>
                          </div>
                        )}
                      </div>
                    )}
                    {!isLoss && !isWon && hasCheckpointFields && (
                      <div style={{ marginTop: 8, display: 'grid', gap: 3, fontSize: 12 }}>
                        {cp.action_channel && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Canal: </span>
                            <span>{String(cp.action_channel)}</span>
                          </div>
                        )}
                        {cp.action_result && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Resultado: </span>
                            <span>{String(cp.action_result)}</span>
                          </div>
                        )}
                        {cp.result_detail && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Detalhe: </span>
                            <span>{String(cp.result_detail)}</span>
                          </div>
                        )}
                        {cp.next_action && (
                          <div>
                            <span style={{ opacity: 0.55 }}>Próxima ação: </span>
                            <span>{String(cp.next_action)}</span>
                            {nextActionDate && (
                              <span style={{ opacity: 0.55 }}> — {nextActionDate}</span>
                            )}
                          </div>
                        )}
                        {cp.note && (
                          <div style={{ marginTop: 4, borderTop: '1px solid #1e1e1e', paddingTop: 4 }}>
                            <span style={{ opacity: 0.55 }}>Observação: </span>
                            <em style={{ opacity: 0.85 }}>{String(cp.note)}</em>
                          </div>
                        )}
                      </div>
                    )}
                    {!isLoss && !isWon && !hasCheckpointFields && m.reason && (
                      <div style={{ marginTop: 6, opacity: 0.8, fontSize: 12 }}>
                        <span style={{ opacity: 0.55 }}>Motivo: </span>
                        <em>{String(m.reason)}</em>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 8 }}>
            <b>Interações</b>
          </div>
          {!interactions || interactions.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Nenhuma interação registrada ainda.</div>
          ) : (
            interactions.map(it => (
              <div
                key={it.id}
                style={{
                  padding: 12,
                  border: '1px solid #222',
                  borderRadius: 10,
                  marginTop: 10,
                  background: '#111',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <strong>{it.type ?? 'interação'}</strong>
                  </div>
                  <div style={{ opacity: 0.6, fontSize: 12 }}>{it.created_at}</div>
                </div>
                <div style={{ marginTop: 8, opacity: 0.85 }}>{it.note ?? '—'}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}