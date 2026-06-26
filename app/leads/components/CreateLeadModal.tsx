'use client'

import React, { useState, useMemo, useRef } from 'react'
import { adminListSellersStats } from '@/app/lib/services/admin-sellers'
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

function onlyDigits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '')
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function normalizeEmail(value: unknown): string | null {
  const text = String(value ?? '').trim().toLowerCase()
  return text ? text : null
}

function normalizePhone(value: unknown): string | null {
  const digits = onlyDigits(value)
  return digits || null
}

function normalizeDocument(value: unknown): string | null {
  const digits = onlyDigits(value)
  if (digits.length === 11 || digits.length === 14) return digits
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

type ConflictLeadRef = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  deleted_at?: string | null
}

type LeadConflictCheck = {
  document: ConflictLeadRef | null
  phone: ConflictLeadRef | null
  email: ConflictLeadRef | null
}

export default function CreateLeadModal({
  companyId,
  isAdmin,
  groups,
  onLeadCreated,
  onClose,
}: {
  companyId: string
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
  const [createdGroups, setCreatedGroups] = useState<LeadGroup[]>([])
  const [groupSuccess, setGroupSuccess] = useState<string | null>(null)
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

  const availableGroups = useMemo(() => {
    const groupMap = new Map<string, LeadGroup>()

    for (const group of groups) {
      groupMap.set(group.id, group)
    }

    for (const group of createdGroups) {
      groupMap.set(group.id, group)
    }

    return Array.from(groupMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'),
    )
  }, [groups, createdGroups])

  const visibleGroups = availableGroups.slice(0, 50)
  const hasManyGroups = availableGroups.length > visibleGroups.length

  React.useEffect(() => {
    return () => {
      if (cpfTimerRef.current) clearTimeout(cpfTimerRef.current)
    }
  }, [])

  React.useEffect(() => {
    if (!isAdmin) return

    const loadSellers = async () => {
      try {
        const sellersData = await adminListSellersStats({
          companyId,
          days: 30,
        })

        const activeSellers = sellersData
          .filter((seller) => seller.is_active)
          .map((seller) => ({
            id: seller.seller_id,
            full_name: seller.full_name || seller.email || seller.seller_id,
          }))
          .sort((a, b) => a.full_name.localeCompare(b.full_name, 'pt-BR'))

        setSellers(activeSellers)
      } catch (e: unknown) {
        console.error('Erro ao carregar vendedores:', e)
      }
    }

    void loadSellers()
  }, [isAdmin, companyId])

  const createNewGroup = async () => {
    const groupName = newGroupName.trim()

    if (!groupName) {
      setError('Nome do grupo é obrigatório')
      setGroupSuccess(null)
      return
    }

    setCreatingGroup(true)
    setError(null)
    setGroupSuccess(null)

    try {
      const response = await fetch('/api/leads/kanban/actions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'create_group',
          name: groupName,
        }),
      })

      const result = (await response.json().catch(() => null)) as {
        ok?: boolean
        success?: boolean
        id?: string
        name?: string
        error?: string
      } | null

      if (!response.ok || !result?.success || !result.id) {
        throw new Error(result?.error || 'Erro ao criar grupo')
      }

      const createdGroup = {
        id: result.id,
        name: result.name ?? groupName,
      }

      setCreatedGroups((currentGroups) => {
        const alreadyExists = currentGroups.some((group) => group.id === createdGroup.id)

        if (alreadyExists) {
          return currentGroups
        }

        return [...currentGroups, createdGroup]
      })

      setSelectedGroupId(createdGroup.id)
      setNewGroupName('')
      setGroupSuccess(`Grupo "${createdGroup.name}" criado e selecionado.`)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao criar grupo'
      setError(message)
      setGroupSuccess(null)
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

    if (field === 'cpf_cnpj') {
      setCpfWarning(null)
      setCpfConflictLead(null)
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
      .select('id, name, phone, email, deleted_at')
      .eq('company_id', companyId)
      .eq('id', leadId)
      .maybeSingle()

    if (error || !data) return null

    return {
      id: data.id,
      name: data.name ?? null,
      phone: data.phone ?? null,
      email: data.email ?? null,
      deleted_at: data.deleted_at ?? null,
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
    const cleanCEP = onlyDigits(cep)

    if (!cleanCEP) {
      setError(null)
      return
    }

    if (cleanCEP.length < 8) {
      return
    }

    if (cleanCEP.length !== 8) {
      setError('CEP deve ter 8 dígitos')
      return
    }

    setFetchingCEP(true)
    setError(null)

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cleanCEP}/json/`)
      const data = await response.json()

      if (data.erro) {
        setError('CEP não encontrado')
        return
      }

      setFormData((prev) => ({
        ...prev,
        address_cep: cleanCEP,
        address_street: data.logradouro || '',
        address_neighborhood: data.bairro || '',
        address_city: data.localidade || '',
        address_state: data.uf || '',
      }))

      setError(null)
    } catch (e: unknown) {
      setError('Erro ao buscar CEP')
      console.error(e)
    } finally {
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
          .select('id, name, phone, email, deleted_at')
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
            deleted_at: lead.deleted_at ?? null,
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
          .select('id, name, phone, email, deleted_at')
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
            deleted_at: lead.deleted_at ?? null,
          }
        }
      }

      if (email) {
        const { data: emailLeadMatches, error: emailLeadErr } = await supabase
          .from('leads')
          .select('id, name, phone, email, deleted_at')
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
            deleted_at: lead.deleted_at ?? null,
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
    } catch (e: unknown) {
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
        setCpfWarning(null)
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
      if (conflicts.phone.deleted_at) {
        setPhoneWarning(
          `⚠️ Este telefone pertence a um lead excluído: ${formatConflictLeadLabel(conflicts.phone)}.`
        )
      } else {
        setPhoneWarning(`⚠️ Este telefone já existe no lead ${formatConflictLeadLabel(conflicts.phone)}.`)
      }

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
      if (conflicts.email.deleted_at) {
        setEmailWarning(
          `⚠️ Este email pertence a um lead excluído: ${formatConflictLeadLabel(conflicts.email)}.`
        )
      } else {
        setEmailWarning(`⚠️ Este email já existe no lead ${formatConflictLeadLabel(conflicts.email)}.`)
      }

      setEmailConflictLead(conflicts.email)
    } else {
      setEmailWarning(null)
      setEmailConflictLead(null)
    }
  }

  const handleNextStep = () => {
    if (cpfConflictLead && !cpfConflictLead.deleted_at) {
      setError('Este CPF/CNPJ já pertence a um lead ativo. Abra o lead existente em vez de criar outro.')
      setErrorConflictLead(cpfConflictLead)
      return
    }

    if (cpfConflictLead?.deleted_at) {
      if (!isAdmin) {
        setError('Este CPF/CNPJ pertence a um lead excluído. Solicite a reativação desse lead ao administrador.')
        setErrorConflictLead(null)
        return
      }

      setError(null)
      setErrorConflictLead(null)
      setStep('group')
      return
    }

    if (!formData.name.trim()) {
      setError('Nome é obrigatório')
      setErrorConflictLead(null)
      return
    }

    setError(null)
    setErrorConflictLead(null)
    setStep('group')
  }

  const handleCreateLead = async () => {
    const normalizedName = cleanText(formData.name)
    const normalizedDocument = normalizeDocument(formData.cpf_cnpj)

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

    setLoading(true)
    setError(null)
    setErrorConflictLead(null)

    try {
      const response = await fetch('/api/leads/manual-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          cpf_cnpj: formData.cpf_cnpj,
          address_cep: formData.address_cep,
          address_street: formData.address_street,
          address_number: formData.address_number,
          address_complement: formData.address_complement,
          address_neighborhood: formData.address_neighborhood,
          address_city: formData.address_city,
          address_state: formData.address_state,
          notes: formData.notes,
          group_id: selectedGroupId,
          owner_user_id: selectedOwnerId,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        const conflict = result?.conflict
          ? {
              id: String(result.conflict.lead_id),
              name: result.conflict.name ?? null,
              phone: result.conflict.phone ?? null,
              email: result.conflict.email ?? null,
              deleted_at: result.conflict.deleted_at ?? null,
            }
          : null

        if (result?.code === 'active_lead_conflict') {
          setError(
            `⚠️ Lead já ativo no sistema: ${formatConflictLeadLabel(conflict)}. A criação foi bloqueada para evitar duplicidade.`
          )
          setErrorConflictLead(conflict)
          if (conflict) setCpfConflictLead(conflict)
          return
        }

        if (result?.code === 'deleted_lead_conflict') {
          setError(
            isAdmin
              ? 'Este CPF/CNPJ pertence a um lead excluído. Clique em "Configurar reativação" para continuar.'
              : 'Este CPF/CNPJ pertence a um lead excluído. Solicite a reativação desse lead ao administrador.'
          )
          setErrorConflictLead(null)
          if (conflict) setCpfConflictLead(conflict)
          return
        }

        throw new Error(result?.error || 'Erro ao criar lead')
      }

      onLeadCreated()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao criar lead'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdminReactivateLead = async () => {
    if (!isAdmin) {
      setError('Solicite a reativação desse lead ao administrador.')
      return
    }

    if (!cpfConflictLead?.id || !cpfConflictLead.deleted_at) {
      setError('Nenhum lead excluído selecionado para reativação.')
      return
    }

    setLoading(true)
    setError(null)
    setErrorConflictLead(null)

    try {
      const response = await fetch('/api/admin/leads/reactivate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          lead_id: cpfConflictLead.id,
          owner_user_id: selectedOwnerId,
          group_id: selectedGroupId,
        }),
      })

      const result = await response.json().catch(() => null)

      if (!response.ok) {
        throw new Error(result?.error || 'Erro ao reativar lead')
      }

      onLeadCreated()
      onClose()
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Erro ao reativar lead'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-lead-modal-overlay" onClick={onClose}>
      <div
        className="create-lead-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-lead-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="create-lead-modal__header">
          <div id="create-lead-modal-title" className="create-lead-modal__title">
            Criar Novo Lead
          </div>

          <button
            type="button"
            onClick={onClose}
            className="create-lead-modal__close"
            aria-label="Fechar criação de lead"
          >
            ✕
          </button>
        </div>

        <div className="create-lead-modal__body">

        {error && (
          <div className="create-lead-modal__alert create-lead-modal__alert--error">
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
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
                marginBottom: 16,
              }}
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
                  border:
                    cpfWarning || cpfConflictLead
                      ? cpfConflictLead?.deleted_at
                        ? '2px solid #f59e0b'
                        : '2px solid #ef4444'
                      : '1px solid #2a2a2a',
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
                  }}
                >
                  {cpfWarning}
                </div>
              )}

              {cpfConflictLead && (
                <div
                  style={{
                    background: cpfConflictLead.deleted_at
                      ? 'rgba(245, 158, 11, 0.10)'
                      : 'rgba(239, 68, 68, 0.10)',
                    border: cpfConflictLead.deleted_at
                      ? '1px solid rgba(245, 158, 11, 0.45)'
                      : '1px solid rgba(239, 68, 68, 0.45)',
                    borderRadius: 12,
                    padding: 12,
                    marginTop: 10,
                    color: cpfConflictLead.deleted_at ? '#fef3c7' : '#fecaca',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
                    {cpfConflictLead.deleted_at
                      ? 'Lead excluído encontrado'
                      : 'Lead já ativo no sistema'}
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      lineHeight: 1.5,
                      color: cpfConflictLead.deleted_at ? '#fde68a' : '#fecaca',
                    }}
                  >
                    {cpfConflictLead.deleted_at ? (
                      <>
                        Já existe um lead excluído com este CPF/CNPJ:
                        <strong style={{ color: '#fff', marginLeft: 4 }}>
                          {formatConflictLeadLabel(cpfConflictLead)}
                        </strong>
                        .
                        <br />
                        Para evitar duplicidade, o sistema não criará outro cadastro com o mesmo CPF/CNPJ.
                      </>
                    ) : (
                      <>
                        Este CPF/CNPJ já pertence a um lead ativo:
                        <strong style={{ color: '#fff', marginLeft: 4 }}>
                          {formatConflictLeadLabel(cpfConflictLead)}
                        </strong>
                        .
                        <br />
                        A criação foi bloqueada para proteger a base de dados.
                      </>
                    )}
                  </div>

                  {buildConflictLeadMeta(cpfConflictLead) && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 11,
                        color: cpfConflictLead.deleted_at ? '#fcd34d' : '#fecaca',
                      }}
                    >
                      {buildConflictLeadMeta(cpfConflictLead)}
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    {!cpfConflictLead.deleted_at && (
                      <button
                        type="button"
                        onClick={() => openConflictLead(cpfConflictLead)}
                        style={{
                          border: '1px solid rgba(254, 202, 202, 0.45)',
                          background: 'transparent',
                          color: '#fecaca',
                          borderRadius: 8,
                          padding: '8px 12px',
                          fontSize: 12,
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        Abrir lead ativo
                      </button>
                    )}

{cpfConflictLead.deleted_at && (
                      <>
                        {isAdmin ? (
                          <button
                            type="button"
                            onClick={handleNextStep}
                            disabled={loading}
                            style={{
                              border: '1px solid rgba(34, 197, 94, 0.45)',
                              background: '#16a34a',
                              color: '#fff',
                              borderRadius: 8,
                              padding: '8px 12px',
                              fontSize: 12,
                              fontWeight: 900,
                              cursor: loading ? 'not-allowed' : 'pointer',
                              opacity: loading ? 0.6 : 1,
                            }}
                          >
                            Configurar reativação
                          </button>
                        ) : (
                          <div
                            style={{
                              width: '100%',
                              border: '1px solid rgba(253, 230, 138, 0.35)',
                              background: 'rgba(245, 158, 11, 0.08)',
                              color: '#fde68a',
                              borderRadius: 8,
                              padding: '10px 12px',
                              fontSize: 12,
                              fontWeight: 800,
                              lineHeight: 1.4,
                            }}
                          >
                            Solicite a reativação desse lead ao administrador.
                          </div>
                        )}
                      </>
                    )}
                  </div>
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
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 2fr',
                  gap: 8,
                  marginBottom: 8,
                }}
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
            {isAdmin && cpfConflictLead?.deleted_at && (
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.10)',
                  border: '1px solid rgba(245, 158, 11, 0.45)',
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 16,
                  color: '#fef3c7',
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 6 }}>
                  Reativação administrativa
                </div>

                <div style={{ fontSize: 12, lineHeight: 1.5, color: '#fde68a' }}>
                  Você está reativando o lead:
                  <strong style={{ color: '#fff', marginLeft: 4 }}>
                    {formatConflictLeadLabel(cpfConflictLead)}
                  </strong>
                  .
                  <br />
                  Se não escolher vendedor, o lead voltará para o Pool. Se escolher vendedor,
                  ele voltará para o Novo do vendedor selecionado.
                </div>
              </div>
            )}

<div className="create-lead-modal__actions">
              <button
                type="button"
                onClick={onClose}
                className="create-lead-modal__button create-lead-modal__button--secondary"
              >
                Cancelar
              </button>

              <button
                type="button"
                onClick={handleNextStep}
                className="create-lead-modal__button create-lead-modal__button--primary"
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
                onChange={(e) => {
                  setSelectedGroupId(e.target.value || null)
                  setGroupSuccess(null)
                }}
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
              >
                <option value="">Sem grupo</option>
                {visibleGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>

              {hasManyGroups && (
                <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 10 }}>
                  Mostrando os primeiros {visibleGroups.length} grupos de {availableGroups.length}. Use um nome mais específico ou crie um novo grupo.
                </div>
              )}

              {groupSuccess && (
                <div style={{ fontSize: 11, color: '#86efac', marginBottom: 10 }}>
                  {groupSuccess}
                </div>
              )}

              {isAdmin && (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Novo grupo..."
                    value={newGroupName}
                    onChange={(e) => {
                      setNewGroupName(e.target.value)
                      setGroupSuccess(null)
                    }}
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
                      cursor: creatingGroup ? 'not-allowed' : 'pointer',
                      fontWeight: 900,
                      fontSize: 12,
                      opacity: creatingGroup ? 0.6 : 1,
                    }}
                  >
                    {creatingGroup ? '...' : '+'}
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

<div className="create-lead-modal__actions">
              <button
                type="button"
                onClick={() => {
                  setError(null)
                  setErrorConflictLead(null)
                  setStep('form')
                }}
                className="create-lead-modal__button create-lead-modal__button--secondary"
              >
                ← Voltar
              </button>

              <button
                type="button"
                onClick={() => {
                  if (cpfConflictLead?.deleted_at && isAdmin) {
                    void handleAdminReactivateLead()
                    return
                  }

                  void handleCreateLead()
                }}
                disabled={loading}
                className="create-lead-modal__button create-lead-modal__button--success"
              >
                {loading
                  ? cpfConflictLead?.deleted_at && isAdmin
                    ? 'Reativando…'
                    : 'Criando…'
                  : cpfConflictLead?.deleted_at && isAdmin
                    ? '✓ Reativar Lead'
                    : '✓ Criar Lead'}
              </button>
            </div>
          </>
        )}
        </div>
      </div>

      <style jsx global>{`
        .create-lead-modal-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: rgba(3, 5, 10, 0.8);
          backdrop-filter: blur(10px);
        }

        .create-lead-modal {
          width: min(720px, 100%);
          max-height: min(860px, calc(100vh - 48px));
          overflow-y: auto;
          color: #f4f4f5;
          background:
            radial-gradient(circle at top right, rgba(37, 99, 235, 0.1), transparent 32%),
            linear-gradient(180deg, #111318 0%, #0d0f14 100%);
          border: 1px solid #1a1d2e;
          border-radius: 22px;
          box-shadow: 0 28px 90px rgba(0, 0, 0, 0.58);
        }

        .create-lead-modal::-webkit-scrollbar {
          width: 8px;
        }

        .create-lead-modal::-webkit-scrollbar-thumb {
          border: 2px solid #0d0f14;
          border-radius: 999px;
          background: #2a3042;
        }

        .create-lead-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 24px 24px 18px;
          border-bottom: 1px solid #1a1d2e;
        }

        .create-lead-modal__title {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: -0.02em;
          color: #f4f4f5;
        }

        .create-lead-modal__close {
          display: inline-flex;
          width: 36px;
          height: 36px;
          align-items: center;
          justify-content: center;
          border: 1px solid #1a1d2e;
          border-radius: 10px;
          background: #090b0f;
          color: #a1a1aa;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
          transition: 160ms ease;
        }

        .create-lead-modal__close:hover {
          border-color: #2e3650;
          background: #151823;
          color: #ffffff;
        }

        .create-lead-modal__body {
          padding: 22px 24px 24px;
        }

        .create-lead-modal label {
          margin-bottom: 7px !important;
          font-size: 11px !important;
          font-weight: 900 !important;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #71717a !important;
        }

        .create-lead-modal input,
        .create-lead-modal select,
        .create-lead-modal textarea {
          border-radius: 12px !important;
          background: #090b0f !important;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            background 160ms ease;
        }

        .create-lead-modal input,
        .create-lead-modal select {
          min-height: 44px;
        }

        .create-lead-modal textarea {
          min-height: 104px !important;
          font-family: inherit !important;
          line-height: 1.5;
          resize: vertical;
        }

        .create-lead-modal input::placeholder,
        .create-lead-modal textarea::placeholder {
          color: #52525b;
        }

        .create-lead-modal input:focus,
        .create-lead-modal select:focus,
        .create-lead-modal textarea:focus {
          outline: none !important;
          box-shadow:
            0 0 0 3px rgba(59, 130, 246, 0.12),
            inset 0 1px 0 rgba(255, 255, 255, 0.02) !important;
        }

        .create-lead-modal__alert {
          margin-bottom: 18px;
          padding: 14px;
          border: 1px solid rgba(248, 113, 113, 0.28);
          border-radius: 14px;
          background: rgba(127, 29, 29, 0.2);
          color: #fecaca;
          font-size: 12px;
          line-height: 1.5;
        }

        .create-lead-modal__actions {
          display: flex;
          justify-content: flex-end;
          gap: 10px;
          padding-top: 4px;
        }

        .create-lead-modal__button {
          display: inline-flex;
          min-height: 42px;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          padding: 10px 16px;
          cursor: pointer;
          font-size: 13px;
          font-weight: 900;
          transition:
            transform 160ms ease,
            border-color 160ms ease,
            background 160ms ease,
            box-shadow 160ms ease;
        }

        .create-lead-modal__button:hover:not(:disabled) {
          transform: translateY(-1px);
        }

        .create-lead-modal__button:disabled {
          cursor: not-allowed;
          opacity: 0.58;
        }

        .create-lead-modal__button--secondary {
          border: 1px solid #1f2434;
          background: #111318;
          color: #e4e4e7;
        }

        .create-lead-modal__button--secondary:hover:not(:disabled) {
          border-color: #303850;
          background: #171a24;
        }

        .create-lead-modal__button--primary {
          border: 1px solid rgba(96, 165, 250, 0.24);
          background: linear-gradient(180deg, #3b82f6 0%, #2563eb 100%);
          color: #ffffff;
          box-shadow: 0 12px 28px rgba(37, 99, 235, 0.25);
        }

        .create-lead-modal__button--primary:hover:not(:disabled) {
          background: linear-gradient(180deg, #60a5fa 0%, #3b82f6 100%);
        }

        .create-lead-modal__button--success {
          border: 1px solid rgba(52, 211, 153, 0.22);
          background: linear-gradient(180deg, #10b981 0%, #059669 100%);
          color: #ffffff;
          box-shadow: 0 12px 28px rgba(5, 150, 105, 0.2);
        }

        .create-lead-modal__button--success:hover:not(:disabled) {
          background: linear-gradient(180deg, #34d399 0%, #10b981 100%);
        }

        @media (max-width: 640px) {
          .create-lead-modal-overlay {
            align-items: flex-end;
            padding: 12px;
          }

          .create-lead-modal {
            max-height: calc(100vh - 24px);
            border-radius: 20px;
          }

          .create-lead-modal__header,
          .create-lead-modal__body {
            padding-right: 16px;
            padding-left: 16px;
          }

          .create-lead-modal__actions {
            flex-direction: column-reverse;
          }

          .create-lead-modal__button {
            width: 100%;
          }
        }
      `}</style>
    </div>
  )
}