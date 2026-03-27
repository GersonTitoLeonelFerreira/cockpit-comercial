import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { redirect, notFound } from 'next/navigation'

import AddInteraction from './AddInteraction'
import NextContactForm from './NextContactForm'
import LeadActions from './LeadActions'
import LeadProfileTabs from './LeadProfileTabs'

// ✅ novo: box client da IA (auto refresh sem F5)
import LeadAIBoxClient from './LeadAIBoxClient'

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}
function whatsappLink(phone: string | null) {
  const digits = onlyDigits(phone ?? '')
  if (!digits) return null
  const full = digits.startsWith('55') ? digits : `55${digits}`
  return `https://wa.me/${full}`
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type LeadRow = {
  id: string
  name: string
  phone: string | null
  status: string
  created_at: string
  next_action: string | null
  next_contact_at: string | null
  company_id: string
}

type LeadProfileRow = {
  lead_id: string
  lead_type: 'PF' | 'PJ'
  cpf: string | null
  cnpj: string | null
  razao_social: string | null
  email: string | null
  cep: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  address_country: string | null
  birth_date?: string | null
  biological_sex?: string | null
  profession?: string | null
  education_level?: string | null
  marital_status?: string | null
  rg?: string | null
  rg_issuer?: string | null
  rg_state?: string | null
  rne?: string | null
  passport?: string | null
  phone_residential?: string | null
  phone_residential_desc?: string | null
  phone_commercial?: string | null
  phone_commercial_desc?: string | null
  phone_mobile?: string | null
  phone_mobile_desc?: string | null
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
}

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
        async setAll() {
          // Server Component não escreve cookie
        },
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

  const companyId = profile.company_id as string

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .select('id, name, phone, status, created_at, next_action, next_contact_at, company_id')
    .eq('id', leadId)
    .eq('company_id', companyId)
    .single<LeadRow>()

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
  .select(
    'lead_id, lead_type, cpf, cnpj, razao_social, email, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, address_country, birth_date, biological_sex, profession, education_level, marital_status, rg, rg_issuer, rg_state, rne, passport, phone_residential, phone_residential_desc, phone_commercial, phone_commercial_desc, phone_mobile, phone_mobile_desc, emergency_contact_name, emergency_contact_phone'
  )
    .eq('company_id', companyId)
    .eq('lead_id', leadId)
    .maybeSingle<LeadProfileRow>()

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

      <div style={{ opacity: 0.9, marginTop: 8 }}>
        <div>
          <strong>Telefone:</strong> {lead.phone ?? '—'}
          {wa && (
            <>
              {' '}
              •{' '}
              <a href={wa} target="_blank" rel="noreferrer" style={{ color: '#9aa', textDecoration: 'none' }}>
                WhatsApp →
              </a>
            </>
          )}
        </div>
        <div>
          <strong>Status:</strong> {lead.status}
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Criado em: {lead.created_at}</div>
      </div>

      {/* ✅ IA box no client (atualiza sem F5) */}
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

          {!events || events.length === 0 ? (
            <div style={{ opacity: 0.7 }}>Nenhum evento ainda (mova no Kanban para gerar).</div>
          ) : (
            events.map((ev: any) => {
              const m = ev.metadata ?? {}
              const hasCheckpoint =
                m.action_channel || m.action_result || m.next_action || m.note || m.lost_reason || m.win_reason
              const dateLabel = ev.created_at
                ? new Date(ev.created_at).toLocaleString('pt-BR')
                : ev.created_at
              return (
                <div
                  key={ev.id}
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
                      <strong>{ev.event_type}</strong>{' '}
                      {ev.from_stage && ev.to_stage ? (
                        <span style={{ opacity: 0.85 }}>
                          • {String(ev.from_stage).toUpperCase()} → {String(ev.to_stage).toUpperCase()}
                        </span>
                      ) : null}
                    </div>
                    <div style={{ opacity: 0.6, fontSize: 12 }}>{dateLabel}</div>
                  </div>

                  {hasCheckpoint && (
                    <div
                      style={{
                        marginTop: 10,
                        display: 'grid',
                        gap: 4,
                        fontSize: 12,
                      }}
                    >
                      {m.action_channel && (
                        <div>
                          <span style={{ opacity: 0.6 }}>Canal: </span>
                          <span>{String(m.action_channel)}</span>
                        </div>
                      )}
                      {m.action_result && (
                        <div>
                          <span style={{ opacity: 0.6 }}>Resultado: </span>
                          <span>{String(m.action_result)}</span>
                        </div>
                      )}
                      {m.result_detail && (
                        <div>
                          <span style={{ opacity: 0.6 }}>Detalhe: </span>
                          <span style={{ opacity: 0.9 }}>{String(m.result_detail)}</span>
                        </div>
                      )}
                      {m.next_action && (
                        <div>
                          <span style={{ opacity: 0.6 }}>Próxima ação: </span>
                          <span>{String(m.next_action)}</span>
                          {m.next_action_date && (() => {
                            const d = new Date(m.next_action_date)
                            return isNaN(d.getTime()) ? null : (
                              <span style={{ opacity: 0.6 }}>
                                {' '}— {d.toLocaleString('pt-BR')}
                              </span>
                            )
                          })()}
                        </div>
                      )}
                      {m.lost_reason && (
                        <div>
                          <span style={{ opacity: 0.6 }}>Motivo perda: </span>
                          <span style={{ color: '#fca5a5' }}>{String(m.lost_reason)}</span>
                        </div>
                      )}
                      {m.win_reason && (
                        <div>
                          <span style={{ opacity: 0.6 }}>Motivo ganho: </span>
                          <span style={{ color: '#86efac' }}>{String(m.win_reason)}</span>
                        </div>
                      )}
                      {m.note && (
                        <div style={{ marginTop: 4, borderTop: '1px solid #222', paddingTop: 4 }}>
                          <span style={{ opacity: 0.6 }}>Observação: </span>
                          <span style={{ opacity: 0.85, fontStyle: 'italic' }}>{String(m.note)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {!hasCheckpoint && m.reason ? (
                    <div style={{ marginTop: 8, opacity: 0.85, fontSize: 12 }}>
                      <b>Motivo:</b> {String(m.reason)}
                    </div>
                  ) : null}
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
            interactions.map((it: any) => (
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