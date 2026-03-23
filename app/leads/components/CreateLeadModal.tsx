'use client'

import React, { useState, useMemo, useRef } from 'react'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

type LeadGroup = {
  id: string
  name: string
}

type LeadFormData = {
  name: string
  phone: string | null
  email: string | null
  cpf_cnpj: string | null
  address_cep: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  notes: string | null
}

export default function CreateLeadModal({
  companyId,
  userId,
  isAdmin,
  groups,
  onLeadCreated,
  onClose,
}: {
  companyId: string
  userId: string
  isAdmin: boolean
  groups: LeadGroup[]
  onLeadCreated: () => void
  onClose: () => void
}) {
  const supabase = useMemo(() => supabaseBrowser(), [])

  const [step, setStep] = useState<'form' | 'group'>('form')
  const [formData, setFormData] = useState<LeadFormData>({
    name: '',
    phone: '',
    email: '',
    cpf_cnpj: '',
    address_cep: '',
    address_street: '',
    address_number: '',
    address_complement: '',
    address_neighborhood: '',
    address_city: '',
    address_state: '',
    notes: '',
  })

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null)
  const [sellers, setSellers] = useState<{ id: string; full_name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creatingGroup, setCreatingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [fetchingCEP, setFetchingCEP] = useState(false)
  const [cpfWarning, setCpfWarning] = useState<string | null>(null)
  const cpfTimerRef = useRef<number | null>(null)

  React.useEffect(() => {
    if (!isAdmin) return
    
    const loadSellers = async () => {
      try {
        const { data, error: err } = await supabase
          .from('profiles')
          .select('id, full_name')
          .eq('company_id', companyId)
          .in('role', ['member', 'seller', 'consultor'])
          .order('full_name', { ascending: true })

        if (err) throw err
        setSellers((data ?? []) as { id: string; full_name: string }[])
      } catch (e: any) {
        console.error('Erro ao carregar vendedores:', e)
      }
    }

    loadSellers()
  }, [isAdmin, companyId, supabase])

  const createNewGroup = async () => {
    if (!newGroupName.trim()) {
      setError('Nome do grupo é obrigatório')
      return
    }

    setCreatingGroup(true)
    setError(null)

    try {
      const { data, error: err } = await supabase
        .from('lead_groups')
        .insert({
          company_id: companyId,
          name: newGroupName.trim(),
          created_by: userId,
        })
        .select('id, name')
        .single()

      if (err) throw err

      setSelectedGroupId(data.id)
      setNewGroupName('')
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar grupo')
    } finally {
      setCreatingGroup(false)
    }
  }

  const handleFormChange = (field: keyof LeadFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  const fetchAddressFromCEP = async (cep: string) => {
    if (!cep || cep.length < 8) return

    try {
      setFetchingCEP(true)
      setError(null)

      const cleanCEP = cep.replace(/\D/g, '')
      if (cleanCEP.length !== 8) {
        setError('CEP deve ter 8 dígitos')
        return
      }

      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`)
      const data = await response.json()

      if (data.erro) {
        setError('CEP não encontrado')
        setFetchingCEP(false)
        return
      }

      setFormData(prev => ({
        ...prev,
        address_street: data.logradouro || '',
        address_neighborhood: data.bairro || '',
        address_city: data.localidade || '',
        address_state: data.uf || '',
      }))
      setError(null)
      setFetchingCEP(false)
    } catch (e: any) {
      setError('Erro ao buscar CEP')
      console.error(e)
      setFetchingCEP(false)
    }
  }

  const checkCPFExists = async (cpf: string): Promise<boolean> => {
    if (!cpf || !cpf.trim()) return false

    try {
      const { data, error } = await supabase
        .from('leads')
        .select('id', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('cpf_cnpj', cpf.trim())

        return data ? data.length > 0 : false
                } catch (e: any) {
      console.error('Erro ao verificar CPF:', e)
      return false
    }
  }

  const handleCPFChange = (value: string) => {
    handleFormChange('cpf_cnpj', value)
    
    if (!value || !value.trim()) {
      setCpfWarning(null)
      return
    }

    if (cpfTimerRef.current) clearTimeout(cpfTimerRef.current)
    cpfTimerRef.current = setTimeout(async () => {
      const cpfExists = await checkCPFExists(value.trim())
      if (cpfExists) {
        setCpfWarning('⚠️ Este CPF/CNPJ já está cadastrado no sistema')
      } else {
        setCpfWarning(null)
      }
    }, 500)
  }

  const handleNextStep = () => {
    if (!formData.name.trim()) {
      setError('Nome é obrigatório')
      return
    }
    setError(null)
    setStep('group')
  }

  const handleCreateLead = async () => {
    if (!formData.name.trim()) {
      setError('Nome é obrigatório')
      return
    }

    if (formData.cpf_cnpj && formData.cpf_cnpj.trim()) {
      const cpfExists = await checkCPFExists(formData.cpf_cnpj.trim())
      if (cpfExists) {
        setError('⚠️ Este CPF/CNPJ já está cadastrado no sistema')
        return
      }
    }

    setLoading(true)
    setError(null)

    try {
      const { data: leadData, error: leadErr } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          name: formData.name.trim(),
          phone: formData.phone || null,
          email: formData.email || null,
          cpf_cnpj: formData.cpf_cnpj || null,
          address_cep: formData.address_cep || null,
          address_street: formData.address_street || null,
          address_number: formData.address_number || null,
          address_complement: formData.address_complement || null,
          address_neighborhood: formData.address_neighborhood || null,
          address_city: formData.address_city || null,
          address_state: formData.address_state || null,
          notes: formData.notes || null,
          created_by: userId,
          entry_mode: 'manual',
        })
        .select('id')
        .single()

      if (leadErr) throw leadErr

      // ✅ MUDANÇA: Admin → owner_id = NULL (Pool), Vendedor → owner_id = userId
      const ownerUserId = isAdmin ? null : userId
      const ownerFromSelect = selectedOwnerId || ownerUserId

      const { data: cycleData, error: cycleErr } = await supabase
        .from('sales_cycles')
        .insert({
          company_id: companyId,
          lead_id: leadData.id,
          owner_user_id: ownerFromSelect,
          status: 'novo',
          current_group_id: selectedGroupId,
          stage_entered_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (cycleErr) throw cycleErr

      if (selectedGroupId) {
        const { error: lgcErr } = await supabase
          .from('lead_group_cycles')
          .insert({
            company_id: companyId,
            group_id: selectedGroupId,
            cycle_id: cycleData.id,
            attached_by: userId,
          })

        if (lgcErr) throw lgcErr

        await supabase
          .from('cycle_events')
          .insert({
            company_id: companyId,
            cycle_id: cycleData.id,
            event_type: 'group_attached',
            created_by: userId,
            metadata: { group_id: selectedGroupId },
            occurred_at: new Date().toISOString(),
          })
      }

      await supabase
        .from('cycle_events')
        .insert({
          company_id: companyId,
          cycle_id: cycleData.id,
          event_type: 'cycle_created',
          created_by: userId,
          metadata: {
            lead_name: formData.name,
            owner_user_id: ownerFromSelect,
            group_id: selectedGroupId || null,
          },
          occurred_at: new Date().toISOString(),
        })

      onLeadCreated()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar lead')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 12,
          padding: 24,
          width: '90%',
          maxWidth: 700,
          color: 'white',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 18, fontWeight: 900 }}>Criar Novo Lead</div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#999',
              cursor: 'pointer',
              fontSize: 24,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>

        {error && (
          <div
            style={{
              background: '#7f1d1d',
              color: '#fecaca',
              padding: 12,
              borderRadius: 10,
              marginBottom: 16,
              fontSize: 12,
            }}
          >
            {error}
          </div>
        )}

        {step === 'form' ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>Nome *</label>
              <input
                type="text"
                placeholder="Nome completo"
                value={formData.name}
                onChange={(e) => handleFormChange('name', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #2a2a2a',
                  background: '#222',
                  color: 'white',
                  fontSize: 13,
                  marginBottom: 12,
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>Telefone</label>
                <input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={formData.phone || ''}
                  onChange={(e) => handleFormChange('phone', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>Email</label>
                <input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={formData.email || ''}
                  onChange={(e) => handleFormChange('email', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>CPF/CNPJ</label>
              <input
                type="text"
                placeholder="000.000.000-00"
                value={formData.cpf_cnpj || ''}
                onChange={(e) => handleCPFChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: cpfWarning ? '2px solid #ef4444' : '1px solid #2a2a2a',
                  background: '#222',
                  color: 'white',
                  fontSize: 13,
                }}
              />
              {cpfWarning && (
                <div style={{ fontSize: 11, color: '#fecaca', marginTop: 6 }}>
                  {cpfWarning}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>Endereço</label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="CEP"
                  value={formData.address_cep || ''}
                  onChange={(e) => handleFormChange('address_cep', e.target.value)}
                  onBlur={(e) => fetchAddressFromCEP(e.target.value)}
                  disabled={fetchingCEP}
                  style={{
                    flex: 1,
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                    opacity: fetchingCEP ? 0.6 : 1,
                  }}
                />
                {fetchingCEP && <div style={{ fontSize: 11, color: '#fbbf24', alignSelf: 'center' }}>Buscando…</div>}
              </div>

              <input
                type="text"
                placeholder="Rua/Avenida"
                value={formData.address_street || ''}
                onChange={(e) => handleFormChange('address_street', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #2a2a2a',
                  background: '#222',
                  color: 'white',
                  fontSize: 13,
                  marginBottom: 8,
                }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="Número"
                  value={formData.address_number || ''}
                  onChange={(e) => handleFormChange('address_number', e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                />
                <input
                  type="text"
                  placeholder="Complemento"
                  value={formData.address_complement || ''}
                  onChange={(e) => handleFormChange('address_complement', e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  type="text"
                  placeholder="Bairro"
                  value={formData.address_neighborhood || ''}
                  onChange={(e) => handleFormChange('address_neighborhood', e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                />
                <input
                  type="text"
                  placeholder="Cidade"
                  value={formData.address_city || ''}
                  onChange={(e) => handleFormChange('address_city', e.target.value)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>Notas</label>
              <textarea
                placeholder="Observações gerais..."
                value={formData.notes || ''}
                onChange={(e) => handleFormChange('notes', e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #2a2a2a',
                  background: '#222',
                  color: 'white',
                  fontSize: 13,
                  minHeight: 80,
                  fontFamily: 'monospace',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={onClose}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #2a2a2a',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                Cancelar
              </button>

              <button
                onClick={handleNextStep}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#3b82f6',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                Próximo →
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>Grupo (opcional)</label>
              <select
                value={selectedGroupId || ''}
                onChange={(e) => setSelectedGroupId(e.target.value || null)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 8,
                  border: '1px solid #2a2a2a',
                  background: '#222',
                  color: 'white',
                  fontSize: 13,
                  marginBottom: 12,
                }}
              >
                <option value="">Sem grupo</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>

              {isAdmin && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Novo grupo..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #2a2a2a',
                      background: '#222',
                      color: 'white',
                      fontSize: 12,
                    }}
                  />
                  <button
                    onClick={() => void createNewGroup()}
                    disabled={creatingGroup}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#3b82f6',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 900,
                      fontSize: 12,
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            {isAdmin && (
              <div style={{ marginBottom: 20 }}>
                <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>Atribuir para (opcional)</label>
                <select
                  value={selectedOwnerId || ''}
                  onChange={(e) => setSelectedOwnerId(e.target.value || null)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                >
                  <option value="">Pool (sem atribuição)</option>
                  {sellers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setStep('form')}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: '1px solid #2a2a2a',
                  background: 'transparent',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 13,
                }}
              >
                ← Voltar
              </button>

              <button
                onClick={() => void handleCreateLead()}
                disabled={loading}
                style={{
                  padding: '10px 20px',
                  borderRadius: 8,
                  border: 'none',
                  background: '#10b981',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontWeight: 900,
                  fontSize: 13,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                {loading ? 'Criando…' : '✓ Criar Lead'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}