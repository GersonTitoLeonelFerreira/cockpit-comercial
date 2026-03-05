'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

type Pipeline = {
  id: string
  name: string
  key: string
  description: string | null
  is_default?: boolean
  allow_create?: boolean
  is_active?: boolean
}

type Stage = {
  id: string
  name: string
  key: string
  position: number
  is_active?: boolean
}

function onlyDigits(v: any) {
  return String(v ?? '').replace(/\D/g, '')
}
function normStr(v: any) {
  const s = String(v ?? '').trim()
  return s.length ? s : ''
}
function normUF(v: any) {
  const s = String(v ?? '').trim().toUpperCase()
  return s.length ? s.slice(0, 2) : ''
}
function errToString(e: any) {
  if (!e) return '(sem detalhes)'
  if (typeof e === 'string') return e
  if (e?.message) return e.message
  try {
    return JSON.stringify(e)
  } catch {
    return String(e)
  }
}

export default function LeadForm({
  userId,
  companyId,
  role,
  onSaved,
}: {
  userId: string
  companyId: string
  role: string | null
  onSaved?: (leadId: string) => void
}) {
  const router = useRouter()

  const [open, setOpen] = React.useState(false)
  const [loading, setLoading] = React.useState(false)

  // básicos
  const [name, setName] = React.useState('')
  const [phone, setPhone] = React.useState('')

  // perfil (PF/PJ)
  const [tipo, setTipo] = React.useState<'PF' | 'PJ'>('PF')
  const [email, setEmail] = React.useState('')
  const [cpf, setCpf] = React.useState('')
  const [cnpj, setCnpj] = React.useState('')
  const [razaoSocial, setRazaoSocial] = React.useState('')

  // endereço
  const [cep, setCep] = React.useState('')
  const [rua, setRua] = React.useState('')
  const [numero, setNumero] = React.useState('')
  const [complemento, setComplemento] = React.useState('')
  const [bairro, setBairro] = React.useState('')
  const [cidade, setCidade] = React.useState('')
  const [uf, setUf] = React.useState('SC')
  const [pais, setPais] = React.useState('Brasil')

  // pipeline / etapa
  const [pipelines, setPipelines] = React.useState<Pipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = React.useState('')
  const [stages, setStages] = React.useState<Stage[]>([])
  const [selectedStageId, setSelectedStageId] = React.useState('')

  const selectedPipeline = React.useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  )

  const isAdmin = role === 'admin'

  // carrega pipelines quando abre modal
  React.useEffect(() => {
    if (!open) return
    if (!companyId) return

    ;(async () => {
      const { data, error } = await supabase
        .from('pipelines')
        .select('id,name,key,description,is_default,allow_create,is_active,company_id')
        .eq('company_id', companyId)
        .eq('is_active', true)

      if (error) {
        console.warn('Erro ao carregar pipelines:', error.message)
        setPipelines([])
        setSelectedPipelineId('')
        return
      }

      const list = (data ?? [])
        .filter((p: any) => p.allow_create !== false)
        .sort((a: any, b: any) => {
          const ad = a.is_default ? 0 : 1
          const bd = b.is_default ? 0 : 1
          if (ad !== bd) return ad - bd
          return String(a.name).localeCompare(String(b.name))
        }) as Pipeline[]

      setPipelines(list)

      const def = list.find((p: any) => p.is_default) ?? list[0]
      setSelectedPipelineId(def?.id ?? '')
    })()
  }, [open, companyId])

  // carrega stages quando pipeline muda
  React.useEffect(() => {
    if (!open) return
    if (!selectedPipelineId) {
      setStages([])
      setSelectedStageId('')
      return
    }

    ;(async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id,name,key,position,is_active,pipeline_id')
        .eq('pipeline_id', selectedPipelineId)
        .eq('is_active', true)
        .order('position', { ascending: true })

      if (error) {
        console.warn('Erro ao carregar stages:', error.message)
        setStages([])
        setSelectedStageId('')
        return
      }

      const list = (data ?? []) as any as Stage[]
      setStages(list)
      setSelectedStageId(list[0]?.id ?? '')
    })()
  }, [open, selectedPipelineId])

  function resetForm() {
    setName('')
    setPhone('')
    setTipo('PF')
    setEmail('')
    setCpf('')
    setCnpj('')
    setRazaoSocial('')
    setCep('')
    setRua('')
    setNumero('')
    setComplemento('')
    setBairro('')
    setCidade('')
    setUf('SC')
    setPais('Brasil')
  }

  async function salvar() {
    if (loading) return

    const n = normStr(name)
    const pDigits = onlyDigits(phone)
    const phoneToSave = pDigits ? pDigits : null
    const em = normStr(email)

    if (!n) {
      alert('Digite o nome do lead.')
      return
    }
    if (!phoneToSave && !em) {
      alert('Informe Telefone ou E-mail.')
      return
    }
    if (!selectedPipelineId || !selectedStageId) {
      alert('Selecione Pipeline e Etapa inicial.')
      return
    }

    setLoading(true)
    try {
      const leadPayload: any = {
        company_id: companyId,
        owner_id: isAdmin ? null : userId,
        created_by: userId,

        // obrigatórios/úteis no leads
        name: n,
        phone: phoneToSave,
        email: em || null,

        status: 'novo',
        current_pipeline_id: selectedPipelineId,
        current_stage_id: selectedStageId,
      }

      const { data: inserted, error: leadErr } = await supabase
        .from('leads')
        .insert(leadPayload)
        .select('id')
        .single()

      if (leadErr) throw leadErr
      const leadId = inserted?.id
      if (!leadId) throw new Error('Lead não retornou id.')

      // 2) upsert lead_profiles (cadastro completo)
      const payloadProfile: any = {
        lead_id: leadId,
        company_id: companyId,
        lead_type: tipo,

        email: em || null,
        cep: (() => {
          const c = onlyDigits(cep)
          return c.length === 8 ? c : null
        })(),

        address_street: normStr(rua) || null,
        address_number: normStr(numero) || null,
        address_complement: normStr(complemento) || null,
        address_neighborhood: normStr(bairro) || null,
        address_city: normStr(cidade) || null,
        address_state: normUF(uf) || null,
        address_country: normStr(pais) || 'Brasil',
      }

      if (tipo === 'PF') {
        const cpfDigits = onlyDigits(cpf)
        payloadProfile.cpf = cpfDigits.length === 11 ? cpfDigits : null
        payloadProfile.cnpj = null
        payloadProfile.razao_social = null
      } else {
        const cnpjDigits = onlyDigits(cnpj)
        payloadProfile.cnpj = cnpjDigits.length === 14 ? cnpjDigits : null
        payloadProfile.razao_social = normStr(razaoSocial) || null
        payloadProfile.cpf = null
      }

      const { error: profErr } = await supabase
        .from('lead_profiles')
        .upsert(payloadProfile, { onConflict: 'lead_id' })

      if (profErr) console.warn('Erro lead_profiles:', errToString(profErr))

      // 3) criar sales_cycle e evento inicial
      const nowIso = new Date().toISOString()
      const cyclePayload = {
        company_id: companyId,
        lead_id: leadId,
        owner_user_id: isAdmin ? null : userId,
        status: 'novo',
        stage_entered_at: nowIso,
      }

      const { data: cycleInserted, error: cycleErr } = await supabase
        .from('sales_cycles')
        .insert(cyclePayload)
        .select('id')
        .single()

      if (cycleErr) {
        console.warn('Erro ao criar sales_cycle:', errToString(cycleErr))
      } else if (cycleInserted?.id) {
        const { error: evtErr } = await supabase.from('cycle_events').insert({
          cycle_id: cycleInserted.id,
          company_id: companyId,
          user_id: userId,
          event_type: 'cycle_created',
          from_stage: null,
          to_stage: 'novo',
          metadata: {},
        })
        if (evtErr) console.warn('Erro ao registrar cycle_event:', errToString(evtErr))
      }

      setOpen(false)
      resetForm()

      // ✅ garante atualização no Kanban/Pool sem depender só do router.refresh
      onSaved?.(leadId)
      router.refresh()
    } catch (e: any) {
      alert(errToString(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid #333',
          background: '#111',
          color: 'white',
          cursor: 'pointer',
        }}
      >
        + Novo lead
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-start',
            padding: 24,
            overflowY: 'auto',
            zIndex: 9999,
          }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 1100,
              marginTop: 20,
              maxHeight: 'calc(100vh - 80px)',
              overflowY: 'auto',
              background: '#0f0f0f',
              border: '1px solid #333',
              borderRadius: 16,
              padding: 20,
              color: 'white',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Novo Lead</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                  Escolha pipeline e etapa de entrada. Isso define a régua e as métricas.
                </div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                  Modo: <b>{isAdmin ? 'Admin (vai para POOL)' : 'Consultor (vai para sua carteira)'}</b>
                </div>
              </div>

              <button
                onClick={() => setOpen(false)}
                style={{
                  border: '1px solid #333',
                  background: 'transparent',
                  color: '#9aa',
                  borderRadius: 10,
                  padding: '8px 10px',
                  cursor: 'pointer',
                  height: 'fit-content',
                }}
              >
                ✕
              </button>
            </div>

            {/* Pipeline / Etapa */}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={labelStyle}>Pipeline</div>
                <select
                  value={selectedPipelineId}
                  onChange={(e) => setSelectedPipelineId(e.target.value)}
                  style={inputStyle}
                >
                  {pipelines.length === 0 ? <option value="">(sem pipelines)</option> : null}
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>

                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  {selectedPipeline?.description ??
                    (selectedPipeline?.key === 'sdr'
                      ? 'Pré-vendas: qualifica antes de enviar para fechamento.'
                      : selectedPipeline?.key === 'sales'
                        ? 'Vendas: reunião → proposta → negociação → fechamento.'
                        : '')}
                </div>
              </div>

              <div>
                <div style={labelStyle}>Etapa inicial</div>
                <select
                  value={selectedStageId}
                  onChange={(e) => setSelectedStageId(e.target.value)}
                  style={inputStyle}
                >
                  {stages.length === 0 ? <option value="">(sem etapas)</option> : null}
                  {stages.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.position}. {s.name}
                    </option>
                  ))}
                </select>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>Padrão: primeira etapa do pipeline.</div>
              </div>
            </div>

            {/* Básico */}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={labelStyle}>Nome *</div>
                <input value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Nome do lead" />
              </div>

              <div>
                <div style={labelStyle}>Telefone</div>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} style={inputStyle} placeholder="DDD + número" />
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14 }}>
              <div>
                <div style={labelStyle}>Tipo</div>
                <select value={tipo} onChange={(e) => setTipo(e.target.value === 'PJ' ? 'PJ' : 'PF')} style={inputStyle}>
                  <option value="PF">PF</option>
                  <option value="PJ">PJ</option>
                </select>
              </div>

              <div>
                <div style={labelStyle}>E-mail</div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="email@exemplo.com" />
              </div>
            </div>

            {/* PF/PJ */}
            <div style={{ marginTop: 14 }}>
              {tipo === 'PF' ? (
                <div>
                  <div style={labelStyle}>CPF</div>
                  <input value={cpf} onChange={(e) => setCpf(e.target.value)} style={inputStyle} placeholder="Somente números" />
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <div style={labelStyle}>CNPJ</div>
                    <input value={cnpj} onChange={(e) => setCnpj(e.target.value)} style={inputStyle} placeholder="Somente números" />
                  </div>
                  <div>
                    <div style={labelStyle}>Razão Social</div>
                    <input value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} style={inputStyle} placeholder="Nome jurídico" />
                  </div>
                </div>
              )}
            </div>

            {/* Endereço */}
            <div style={{ marginTop: 16, border: '1px solid #333', borderRadius: 14, padding: 14, background: '#111' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Endereço (opcional)</div>

              <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 220px', gap: 14 }}>
                <div>
                  <div style={labelStyle}>CEP</div>
                  <input value={cep} onChange={(e) => setCep(e.target.value)} style={inputStyle} placeholder="Somente números" />
                </div>
                <div>
                  <div style={labelStyle}>Rua</div>
                  <input value={rua} onChange={(e) => setRua(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Número</div>
                  <input value={numero} onChange={(e) => setNumero(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={labelStyle}>Complemento</div>
                  <input value={complemento} onChange={(e) => setComplemento(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>Bairro</div>
                  <input value={bairro} onChange={(e) => setBairro(e.target.value)} style={inputStyle} />
                </div>
              </div>

              <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 140px 200px', gap: 14 }}>
                <div>
                  <div style={labelStyle}>Cidade</div>
                  <input value={cidade} onChange={(e) => setCidade(e.target.value)} style={inputStyle} />
                </div>
                <div>
                  <div style={labelStyle}>UF</div>
                  <input value={uf} onChange={(e) => setUf(e.target.value)} style={inputStyle} placeholder="SC" />
                </div>
                <div>
                  <div style={labelStyle}>País</div>
                  <input value={pais} onChange={(e) => setPais(e.target.value)} style={inputStyle} />
                </div>
              </div>
            </div>

            {/* ações */}
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => setOpen(false)} disabled={loading} style={btnSecondary}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={loading} style={btnPrimary}>
                {loading ? 'Salvando…' : 'Salvar lead'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.8, marginBottom: 6 }

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#0f0f0f',
  color: 'white',
  outline: 'none',
}

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #333',
  background: '#111',
  color: 'white',
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 10,
  border: '1px solid #333',
  background: 'transparent',
  color: '#9aa',
  cursor: 'pointer',
}