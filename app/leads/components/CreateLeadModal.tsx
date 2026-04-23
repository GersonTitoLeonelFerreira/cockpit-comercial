'use client'

import React, { useState, useMemo, useRef } from 'react'
import { supabaseBrowser } from '../../lib/supabaseBrowser'
import { EVENT_SOURCES } from '@/app/config/analyticsBase'

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

function onlyDigits(value: any): string {
  return String(value ?? '').replace(/\D/g, '')
}

function cleanText(value: any): string | null {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function normalizeEmail(value: any): string | null {
  const text = String(value ?? '').trim().toLowerCase()
  return text ? text : null
}

function normalizePhone(value: any): string | null {
  const digits = onlyDigits(value)
  return digits || null
}

function normalizeDocument(value: any): string | null {
  const digits = onlyDigits(value)
  if (digits.length === 11 || digits.length === 14) return digits
  return digits || null
}

function normalizeCEP(value: any): string | null {
  const digits = onlyDigits(value)
  return digits || null
}

function hasRepeatedDigits(value: string): boolean {
  return /^(\d)\1+$/.test(value)
}

function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value)

  if (cpf.length !== 11) return false
  if (hasRepeatedDigits(cpf)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number(cpf[i]) * (10 - i)
  }

  let firstCheck = (sum * 10) % 11
  if (firstCheck === 10) firstCheck = 0
  if (firstCheck !== Number(cpf[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += Number(cpf[i]) * (11 - i)
  }

  let secondCheck = (sum * 10) % 11
  if (secondCheck === 10) secondCheck = 0

  return secondCheck === Number(cpf[10])
}

function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value)

  if (cnpj.length !== 14) return false
  if (hasRepeatedDigits(cnpj)) return false

  const calcCheckDigit = (base: string, weights: number[]) => {
    const sum = base
      .split('')
      .reduce((acc, digit, index) => acc + Number(digit) * weights[index], 0)

    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }

  const base12 = cnpj.slice(0, 12)
  const digit1 = calcCheckDigit(base12, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const base13 = `${base12}${digit1}`
  const digit2 = calcCheckDigit(base13, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])

  return cnpj === `${base12}${digit1}${digit2}`
}

function isValidDocument(value: string | null): boolean {
  if (!value) return false

  const digits = onlyDigits(value)

  if (digits.length === 11) return isValidCPF(digits)
  if (digits.length === 14) return isValidCNPJ(digits)

  return false
}

function getLeadTypeFromDocument(document: string | null): 'PF' | 'PJ' | null {
  if (!document) return null
  if (document.length === 11) return 'PF'
  if (document.length === 14) return 'PJ'
  return null
}

type ConflictLeadRef = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
}

type LeadConflictCheck = {
  document: ConflictLeadRef | null
  phone: ConflictLeadRef | null
  email: ConflictLeadRef | null
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
  const [phoneWarning, setPhoneWarning] = useState<string | null>(null)
  const [emailWarning, setEmailWarning] = useState<string | null>(null)
  const [cpfConflictLead, setCpfConflictLead] = useState<ConflictLeadRef | null>(null)
  const [phoneConflictLead, setPhoneConflictLead] = useState<ConflictLeadRef | null>(null)
  const [emailConflictLead, setEmailConflictLead] = useState<ConflictLeadRef | null>(null)
  const [errorConflictLead, setErrorConflictLead] = useState<ConflictLeadRef | null>(null)
  const cpfTimerRef = useRef<number | null>(null)

  React.useEffect(() => {
    return () => {
      if (cpfTimerRef.current) clearTimeout(cpfTimerRef.current)
    }
  }, [])

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

    void loadSellers()
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
    if (field === 'phone') {
      setPhoneWarning(null)
      setPhoneConflictLead(null)
      setError(null)
      setErrorConflictLead(null)
    }
  
    if (field === 'email') {
      setEmailWarning(null)
      setEmailConflictLead(null)
      setError(null)
      setErrorConflictLead(null)
    }
  
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const fetchLeadSummaryById = async (leadId: string): Promise<ConflictLeadRef | null> => {
    const { data, error } = await supabase
      .from('leads')
      .select('id, name, phone, email')
      .eq('company_id', companyId)
      .eq('id', leadId)
      .maybeSingle()

    if (error || !data) return null

    return {
      id: data.id,
      name: data.name ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
    }
  }

  const formatConflictLeadLabel = (lead: ConflictLeadRef | null): string => {
    if (!lead) return 'lead existente'

    const name = cleanText(lead.name) || 'Sem nome'
    const shortId = lead.id.slice(0, 8)

    return `${name} (${shortId})`
  }

  const openConflictLead = (lead: ConflictLeadRef | null) => {
    if (!lead?.id) return
    window.open(`/leads/${lead.id}`, '_blank', 'noopener,noreferrer')
  }

  const buildConflictLeadMeta = (lead: ConflictLeadRef | null): string | null => {
    if (!lead) return null
  
    const parts: string[] = []
  
    if (lead.phone) parts.push(`Telefone: ${lead.phone}`)
    if (lead.email) parts.push(`Email: ${lead.email}`)
  
    return parts.length > 0 ? parts.join(' • ') : null
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

      setFormData((prev) => ({
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

  const checkLeadConflicts = async ({
    rawDocument,
    rawPhone,
    rawEmail,
  }: {
    rawDocument?: string | null
    rawPhone?: string | null
    rawEmail?: string | null
  }): Promise<LeadConflictCheck> => {
    const document = normalizeDocument(rawDocument)
    const phone = normalizePhone(rawPhone)
    const email = normalizeEmail(rawEmail)

    const result: LeadConflictCheck = {
      document: null,
      phone: null,
      email: null,
    }

    try {
      if (document && isValidDocument(document)) {
        const { data: leadMatches, error: leadErr } = await supabase
          .from('leads')
          .select('id, name, phone, email')
          .eq('company_id', companyId)
          .eq('cpf_cnpj', document)
          .limit(1)

        if (leadErr) throw leadErr

        if ((leadMatches ?? []).length > 0) {
          const lead = leadMatches![0]
          result.document = {
            id: lead.id,
            name: lead.name ?? null,
            phone: lead.phone ?? null,
            email: lead.email ?? null,
          }
        } else if (document.length === 11) {
          const { data: profileMatches, error: profileErr } = await supabase
            .from('lead_profiles')
            .select('lead_id')
            .eq('company_id', companyId)
            .eq('cpf', document)
            .limit(1)

          if (profileErr) throw profileErr

          const leadId = profileMatches?.[0]?.lead_id
          if (leadId) {
            result.document = await fetchLeadSummaryById(leadId)
          }
        } else {
          const { data: profileMatches, error: profileErr } = await supabase
            .from('lead_profiles')
            .select('lead_id')
            .eq('company_id', companyId)
            .eq('cnpj', document)
            .limit(1)

          if (profileErr) throw profileErr

          const leadId = profileMatches?.[0]?.lead_id
          if (leadId) {
            result.document = await fetchLeadSummaryById(leadId)
          }
        }
      }

      if (phone) {
        const { data: phoneMatches, error: phoneErr } = await supabase
          .from('leads')
          .select('id, name, phone, email')
          .eq('company_id', companyId)
          .eq('phone', phone)
          .limit(1)

        if (phoneErr) throw phoneErr

        if ((phoneMatches ?? []).length > 0) {
          const lead = phoneMatches![0]
          result.phone = {
            id: lead.id,
            name: lead.name ?? null,
            phone: lead.phone ?? null,
            email: lead.email ?? null,
          }
        }
      }

      if (email) {
        const { data: emailLeadMatches, error: emailLeadErr } = await supabase
          .from('leads')
          .select('id, name, phone, email')
          .eq('company_id', companyId)
          .eq('email', email)
          .limit(1)

        if (emailLeadErr) throw emailLeadErr

        if ((emailLeadMatches ?? []).length > 0) {
          const lead = emailLeadMatches![0]
          result.email = {
            id: lead.id,
            name: lead.name ?? null,
            phone: lead.phone ?? null,
            email: lead.email ?? null,
          }
        } else {
          const { data: emailProfileMatches, error: emailProfileErr } = await supabase
            .from('lead_profiles')
            .select('lead_id')
            .eq('company_id', companyId)
            .eq('email', email)
            .limit(1)

          if (emailProfileErr) throw emailProfileErr

          const leadId = emailProfileMatches?.[0]?.lead_id
          if (leadId) {
            result.email = await fetchLeadSummaryById(leadId)
          }
        }
      }

      return result
    } catch (e: any) {
      console.error('Erro ao verificar conflitos do lead:', e)
      return result
    }
  }

  const handleCPFChange = (value: string) => {
    handleFormChange('cpf_cnpj', value)
    setError(null)
    setErrorConflictLead(null)
  
    const normalizedDocument = normalizeDocument(value)
  
    if (!normalizedDocument) {
      setCpfWarning(null)
      setCpfConflictLead(null)
      return
    }
  
    // Enquanto a pessoa ainda está digitando, não acusa erro
    if (![11, 14].includes(normalizedDocument.length)) {
      setCpfWarning(null)
      setCpfConflictLead(null)
      return
    }
  
    if (!isValidDocument(normalizedDocument)) {
      const label = normalizedDocument.length === 14 ? 'CNPJ' : 'CPF'
      setCpfWarning(`⚠️ ${label} inválido.`)
      setCpfConflictLead(null)
      return
    }
  
    if (cpfTimerRef.current) clearTimeout(cpfTimerRef.current)
  
    cpfTimerRef.current = window.setTimeout(async () => {
      const conflicts = await checkLeadConflicts({ rawDocument: normalizedDocument })
  
      if (conflicts.document) {
        setCpfWarning(
          `⚠️ Este CPF/CNPJ já está cadastrado no lead ${formatConflictLeadLabel(conflicts.document)}.`
        )
        setCpfConflictLead(conflicts.document)
      } else {
        setCpfWarning(null)
        setCpfConflictLead(null)
      }
    }, 500)
  }

  const handlePhoneBlur = async () => {
    const normalizedPhone = normalizePhone(formData.phone)
  
    if (!normalizedPhone) {
      setPhoneWarning(null)
      setPhoneConflictLead(null)
      return
    }
  
    const conflicts = await checkLeadConflicts({ rawPhone: normalizedPhone })
  
    if (conflicts.phone) {
      setPhoneWarning(`⚠️ Este telefone já existe no lead ${formatConflictLeadLabel(conflicts.phone)}.`)
      setPhoneConflictLead(conflicts.phone)
    } else {
      setPhoneWarning(null)
      setPhoneConflictLead(null)
    }
  }

  const handleEmailBlur = async () => {
    const normalizedEmail = normalizeEmail(formData.email)
  
    if (!normalizedEmail) {
      setEmailWarning(null)
      setEmailConflictLead(null)
      return
    }
  
    const conflicts = await checkLeadConflicts({ rawEmail: normalizedEmail })
  
    if (conflicts.email) {
      setEmailWarning(`⚠️ Este email já existe no lead ${formatConflictLeadLabel(conflicts.email)}.`)
      setEmailConflictLead(conflicts.email)
    } else {
      setEmailWarning(null)
      setEmailConflictLead(null)
    }
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
    const normalizedName = cleanText(formData.name)
    const normalizedPhone = normalizePhone(formData.phone)
    const normalizedEmail = normalizeEmail(formData.email)
    const normalizedDocument = normalizeDocument(formData.cpf_cnpj)
    const normalizedCEP = normalizeCEP(formData.address_cep)

    if (!normalizedName) {
      setError('Nome é obrigatório')
      return
    }

    if (normalizedDocument) {
      if (![11, 14].includes(normalizedDocument.length)) {
        setError('CPF/CNPJ inválido')
        setErrorConflictLead(null)
        return
      }
    
      if (!isValidDocument(normalizedDocument)) {
        setError(normalizedDocument.length === 14 ? 'CNPJ inválido' : 'CPF inválido')
        setErrorConflictLead(null)
        return
      }
    }

    const conflicts = await checkLeadConflicts({
      rawDocument: normalizedDocument,
      rawPhone: normalizedPhone,
      rawEmail: normalizedEmail,
    })

    if (conflicts.document) {
      setError(`⚠️ Este CPF/CNPJ já está cadastrado no lead ${formatConflictLeadLabel(conflicts.document)}.`)
      setErrorConflictLead(conflicts.document)
      setCpfConflictLead(conflicts.document)
      return
    }
    
    setError(null)
    setErrorConflictLead(null)
    
    if (conflicts.phone) {
      setPhoneWarning(`⚠️ Este telefone já existe no lead ${formatConflictLeadLabel(conflicts.phone)}.`)
      setPhoneConflictLead(conflicts.phone)
    } else {
      setPhoneWarning(null)
      setPhoneConflictLead(null)
    }
    
    if (conflicts.email) {
      setEmailWarning(`⚠️ Este email já existe no lead ${formatConflictLeadLabel(conflicts.email)}.`)
      setEmailConflictLead(conflicts.email)
    } else {
      setEmailWarning(null)
      setEmailConflictLead(null)
    }
    
    setLoading(true)

    try {
      const { data: leadData, error: leadErr } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          name: normalizedName,
          phone: normalizedPhone,
          email: normalizedEmail,
          cpf_cnpj: normalizedDocument,
          address_cep: normalizedCEP,
          address_street: cleanText(formData.address_street),
          address_number: cleanText(formData.address_number),
          address_complement: cleanText(formData.address_complement),
          address_neighborhood: cleanText(formData.address_neighborhood),
          address_city: cleanText(formData.address_city),
          address_state: cleanText(formData.address_state),
          notes: cleanText(formData.notes),
          created_by: userId,
          entry_mode: 'manual',
        })
        .select('id')
        .single()

      if (leadErr) throw leadErr

      const leadType = getLeadTypeFromDocument(normalizedDocument)

      const profilePayload: Record<string, any> = {
        lead_id: leadData.id,
        company_id: companyId,
        lead_type: leadType,
        email: normalizedEmail,
        cep: normalizedCEP,
        address_street: cleanText(formData.address_street),
        address_number: cleanText(formData.address_number),
        address_complement: cleanText(formData.address_complement),
        address_neighborhood: cleanText(formData.address_neighborhood),
        address_city: cleanText(formData.address_city),
        address_state: cleanText(formData.address_state),
        address_country: 'Brasil',
      }

      if (normalizedDocument?.length === 11) {
        profilePayload.cpf = normalizedDocument
        profilePayload.cnpj = null
      } else if (normalizedDocument?.length === 14) {
        profilePayload.cnpj = normalizedDocument
        profilePayload.cpf = null
      }

      Object.keys(profilePayload).forEach((key) => {
        if (
          profilePayload[key] === null ||
          profilePayload[key] === undefined ||
          profilePayload[key] === ''
        ) {
          delete profilePayload[key]
        }
      })

      const { error: profileErr } = await supabase
        .from('lead_profiles')
        .upsert(profilePayload, { onConflict: 'lead_id' })

      if (profileErr) throw profileErr

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

        await supabase.from('cycle_events').insert({
          company_id: companyId,
          cycle_id: cycleData.id,
          event_type: 'group_attached',
          created_by: userId,
          metadata: { group_id: selectedGroupId },
          occurred_at: new Date().toISOString(),
        })
      }

      await supabase.from('cycle_events').insert({
        company_id: companyId,
        cycle_id: cycleData.id,
        event_type: 'cycle_created',
        created_by: userId,
        metadata: {
          lead_name: formData.name,
          owner_user_id: ownerFromSelect,
          group_id: selectedGroupId || null,
          source: EVENT_SOURCES.cycle_create,
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
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}
        >
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
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    }}
  >
    <div>
      <div>{error}</div>
      {errorConflictLead && buildConflictLeadMeta(errorConflictLead) && (
        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.9 }}>
          {buildConflictLeadMeta(errorConflictLead)}
        </div>
      )}
    </div>

    {errorConflictLead?.id && (
      <button
        type="button"
        onClick={() => openConflictLead(errorConflictLead)}
        style={{
          border: '1px solid #fecaca',
          background: 'transparent',
          color: '#fecaca',
          borderRadius: 8,
          padding: '8px 10px',
          fontSize: 11,
          fontWeight: 800,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Abrir lead
      </button>
    )}
  </div>
)}

        {step === 'form' ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                Nome *
              </label>
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

            <div
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}
            >
              <div>
                <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                  Telefone
                </label>
                <input
                  type="tel"
                  placeholder="(11) 99999-9999"
                  value={formData.phone || ''}
                  onChange={(e) => handleFormChange('phone', e.target.value)}
                  onBlur={() => void handlePhoneBlur()}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: phoneWarning ? '2px solid #f59e0b' : '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                />
                {phoneWarning && (
  <div
    style={{
      fontSize: 11,
      color: '#fcd34d',
      marginTop: 6,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    }}
  >
    <div>
      <div>{phoneWarning}</div>
      {phoneConflictLead && buildConflictLeadMeta(phoneConflictLead) && (
        <div style={{ marginTop: 4, opacity: 0.9 }}>
          {buildConflictLeadMeta(phoneConflictLead)}
        </div>
      )}
    </div>

    {phoneConflictLead?.id && (
      <button
        type="button"
        onClick={() => openConflictLead(phoneConflictLead)}
        style={{
          border: '1px solid #fcd34d',
          background: 'transparent',
          color: '#fcd34d',
          borderRadius: 8,
          padding: '6px 8px',
          fontSize: 10,
          fontWeight: 800,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Abrir lead
      </button>
    )}
  </div>
)}
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                  Email
                </label>
                <input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={formData.email || ''}
                  onChange={(e) => handleFormChange('email', e.target.value)}
                  onBlur={() => void handleEmailBlur()}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: 8,
                    border: emailWarning ? '2px solid #f59e0b' : '1px solid #2a2a2a',
                    background: '#222',
                    color: 'white',
                    fontSize: 13,
                  }}
                />
                {emailWarning && (
  <div
    style={{
      fontSize: 11,
      color: '#fcd34d',
      marginTop: 6,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    }}
  >
    <div>
      <div>{emailWarning}</div>
      {emailConflictLead && buildConflictLeadMeta(emailConflictLead) && (
        <div style={{ marginTop: 4, opacity: 0.9 }}>
          {buildConflictLeadMeta(emailConflictLead)}
        </div>
      )}
    </div>

    {emailConflictLead?.id && (
      <button
        type="button"
        onClick={() => openConflictLead(emailConflictLead)}
        style={{
          border: '1px solid #fcd34d',
          background: 'transparent',
          color: '#fcd34d',
          borderRadius: 8,
          padding: '6px 8px',
          fontSize: 10,
          fontWeight: 800,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Abrir lead
      </button>
    )}
  </div>
)} 
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                CPF/CNPJ
              </label>
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
  <div
    style={{
      fontSize: 11,
      color: '#fecaca',
      marginTop: 6,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
    }}
  >
    <div>
      <div>{cpfWarning}</div>
      {cpfConflictLead && buildConflictLeadMeta(cpfConflictLead) && (
        <div style={{ marginTop: 4, opacity: 0.9 }}>
          {buildConflictLeadMeta(cpfConflictLead)}
        </div>
      )}
    </div>

    {cpfConflictLead?.id && (
      <button
        type="button"
        onClick={() => openConflictLead(cpfConflictLead)}
        style={{
          border: '1px solid #fecaca',
          background: 'transparent',
          color: '#fecaca',
          borderRadius: 8,
          padding: '6px 8px',
          fontSize: 10,
          fontWeight: 800,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        Abrir lead
      </button>
    )}
  </div>
)}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                Endereço
              </label>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="text"
                  placeholder="CEP"
                  value={formData.address_cep || ''}
                  onChange={(e) => handleFormChange('address_cep', e.target.value)}
                  onBlur={(e) => void fetchAddressFromCEP(e.target.value)}
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
                {fetchingCEP && (
                  <div style={{ fontSize: 11, color: '#fbbf24', alignSelf: 'center' }}>Buscando…</div>
                )}
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

              <div
                style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr', gap: 8, marginBottom: 8 }}
              >
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
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                Notas
              </label>
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
              <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                Grupo (opcional)
              </label>
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
                <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                  Atribuir para (opcional)
                </label>
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
  onClick={() => {
    setError(null)
    setErrorConflictLead(null)
    setStep('form')
  }}
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