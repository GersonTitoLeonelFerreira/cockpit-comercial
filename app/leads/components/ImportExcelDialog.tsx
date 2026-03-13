'use client'

import React, { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

type LeadData = {
  rowNumber: number
  name: string
  cpf_cnpj: string
  phone: string | null
  email: string | null
  birth_date: string | null
  address_cep: string | null
  address_street: string | null
  address_number: string | null
  address_complement: string | null
  address_neighborhood: string | null
  address_city: string | null
  address_state: string | null
  error: string | null
}

type LeadGroup = {
  id: string
  name: string
}

const validators = {
  isCPF: (val: any): boolean => {
    const str = String(val || '').replace(/\D/g, '')
    return (str.length === 11 || str.length === 14) && /^\d+$/.test(str)
  },
  isEmail: (val: any): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val || '').trim())
  },
  isPhone: (val: any): boolean => {
    const str = String(val || '').replace(/\D/g, '')
    return str.length >= 10 && str.length <= 11 && /^\d+$/.test(str)
  },
  isCEP: (val: any): boolean => {
    const str = String(val || '').replace(/\D/g, '')
    return str.length === 8 && /^\d+$/.test(str)
  },
}

const cleanDate = (val: any): string | null => {
  if (!val) return null
  
  const str = String(val).trim()
  
  if (str.includes('/') || str.includes('-')) {
    const datePart = str.split(' ')[0]
    const parts = datePart.split(/[/-]/)
    if (parts.length === 3) {
      const [day, month, year] = parts
      const fullYear = year.length === 2 ? `19${year}` : year
      return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }
  
  return null
}

export default function ImportExcelDialog({
  userId,
  companyId,
  onImported,
  trigger,
}: {
  userId: string
  companyId: string
  onImported: () => void
  trigger: React.ReactNode
}) {
  const supabase = React.useMemo(() => supabaseBrowser(), [])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isOpen, setIsOpen] = useState(false)
  const [step, setStep] = useState<'select' | 'map' | 'preview' | 'success'>('select')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, any>[]>([])
  
  const [columnMap, setColumnMap] = useState({
    name: '',
    cpf: '',
    phone: '',
    email: '',
    birth_date: '',
    cep: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  })

  const [leads, setLeads] = useState<LeadData[]>([])
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // ✅ NOVO: Estado para grupos
  const [groups, setGroups] = useState<LeadGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState<string>('')
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setError(null)
    }
  }

  const loadExcelPreview = async () => {
    if (!selectedFile) {
      setError('Selecione um arquivo')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const arrayBuffer = await selectedFile.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet)

      if (rows.length === 0) {
        setError('Planilha vazia')
        setLoading(false)
        return
      }

      const cols = Object.keys(rows[0])
      setHeaders(cols)
      setRawRows(rows)
      await loadGroups()
      setStep('map')
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao ler arquivo')
    } finally {
      setLoading(false)
    }
  }

  const loadGroups = async () => {
    try {
      const { data } = await supabase
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', companyId)
        .is('archived_at', null)
      setGroups(data || [])
    } catch (e) {
      console.error('Erro ao carregar grupos:', e)
    }
  }

  const createNewGroup = async (groupName: string) => {
    try {
      const { data, error } = await supabase
        .from('lead_groups')
        .insert({
          company_id: companyId,
          name: groupName,
          created_by: userId,  // ✅ ADICIONA ISSO
        })
        .select()
        .single()
  
      if (error) throw error
      
      setGroups([...groups, data])
      setSelectedGroup(data.id)
      setShowCreateGroupModal(false)
      setNewGroupName('')
    } catch (e: any) {
      alert(`Erro ao criar grupo: ${e?.message}`)
    }
  }

  const checkCPFExists = async (cpf: string): Promise<boolean> => {
    try {
      const { data } = await supabase
        .from('lead_profiles')
        .select('lead_id', { count: 'exact' })
        .eq('company_id', companyId)
        .eq('cpf', cpf.replace(/\D/g, ''))

        return data ? data.length > 0 : false
    } catch (e) {
      return false
    }
  }

  const processWithMapping = async () => {
    if (!columnMap.name || !columnMap.cpf) {
      setError('Nome e CPF são obrigatórios')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const cpfsInSheet = new Set<string>()
      const cpfDuplicatas = new Set<string>()

      for (const row of rawRows) {
        const cpfRaw = String(row[columnMap.cpf] || '').replace(/\D/g, '')
        if (cpfRaw && validators.isCPF(cpfRaw)) {
          if (cpfsInSheet.has(cpfRaw)) {
            cpfDuplicatas.add(cpfRaw)
          } else {
            cpfsInSheet.add(cpfRaw)
          }
        }
      }

      const leadsData: LeadData[] = []

      for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
        const row = rawRows[rowIndex]
        const rowNumber = rowIndex + 2

        const cpfRaw = String(row[columnMap.cpf] || '').replace(/\D/g, '')
        const name = String(row[columnMap.name] || '').trim()

        let error: string | null = null

        if (!name) {
          error = 'Nome vazio'
        } else if (!cpfRaw || !validators.isCPF(cpfRaw)) {
          error = 'CPF/CNPJ inválido'
        } else if (cpfDuplicatas.has(cpfRaw)) {
          error = 'CPF duplicado na planilha'
        } else if (await checkCPFExists(cpfRaw)) {
          error = 'CPF já cadastrado'
        }

        const phone = columnMap.phone ? String(row[columnMap.phone] || '').trim() || null : null
        const email = columnMap.email ? String(row[columnMap.email] || '').trim() || null : null
        const birth_date = columnMap.birth_date ? cleanDate(row[columnMap.birth_date]) : null
        const cep = columnMap.cep ? String(row[columnMap.cep] || '').trim() || null : null
        const street = columnMap.street ? String(row[columnMap.street] || '').trim() || null : null
        const number = columnMap.number ? String(row[columnMap.number] || '').trim() || null : null
        const complement = columnMap.complement ? String(row[columnMap.complement] || '').trim() || null : null
        const neighborhood = columnMap.neighborhood ? String(row[columnMap.neighborhood] || '').trim() || null : null
        const city = columnMap.city ? String(row[columnMap.city] || '').trim() || null : null
        const state = columnMap.state ? String(row[columnMap.state] || '').trim() || null : null

        leadsData.push({
          rowNumber,
          name,
          cpf_cnpj: cpfRaw,
          phone: phone && validators.isPhone(phone) ? phone : null,
          email: email && validators.isEmail(email) ? email : null,
          birth_date: birth_date,
          address_cep: cep && validators.isCEP(cep) ? cep : null,
          address_street: street,
          address_number: number,
          address_complement: complement,
          address_neighborhood: neighborhood,
          address_city: city,
          address_state: state,
          error,
        })
      }

      setLeads(leadsData)
      setStep('preview')
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao processar')
    } finally {
      setLoading(false)
    }
  }

  const createAllLeads = async () => {
    const leadsToCreate = leads.filter(l => !l.error)

    if (leadsToCreate.length === 0) {
      setError('Nenhum lead válido')
      return
    }

    setImporting(true)
    setError(null)

    try {
      for (const lead of leadsToCreate) {
        const { data: leadData, error: leadErr } = await supabase
          .from('leads')
          .insert({
            company_id: companyId,
            name: lead.name,
            phone: lead.phone,
            created_by: userId,
          })
          .select('id')
          .single()

        if (leadErr) throw leadErr

        const { error: profileErr } = await supabase
          .from('lead_profiles')
          .insert({
            lead_id: leadData.id,
            company_id: companyId,
            lead_type: lead.cpf_cnpj.length === 11 ? 'PF' : 'PJ',
            cpf: lead.cpf_cnpj.length === 11 ? lead.cpf_cnpj : null,
            cnpj: lead.cpf_cnpj.length === 14 ? lead.cpf_cnpj : null,
            email: lead.email,
            birth_date: lead.birth_date,
            cep: lead.address_cep,
            address_street: lead.address_street,
            address_number: lead.address_number,
            address_complement: lead.address_complement,
            address_neighborhood: lead.address_neighborhood,
            address_city: lead.address_city,
            address_state: lead.address_state,
            address_country: 'Brasil',
          })

        if (profileErr) throw profileErr

        const { error: cycleErr } = await supabase
          .from('sales_cycles')
          .insert({
            company_id: companyId,
            lead_id: leadData.id,
            owner_user_id: null,
            status: 'novo',
            stage_entered_at: new Date().toISOString(),
            current_group_id: selectedGroup || null,
          })

        if (cycleErr) throw cycleErr
      }

      setStep('success')
      onImported()
    } catch (e: any) {
      setError(e?.message ?? 'Erro ao criar leads')
    } finally {
      setImporting(false)
    }
  }

  const resetDialog = () => {
    setStep('select')
    setSelectedFile(null)
    setHeaders([])
    setRawRows([])
    setLeads([])
    setError(null)
    setSelectedGroup('')
    setColumnMap({
      name: '',
      cpf: '',
      phone: '',
      email: '',
      birth_date: '',
      cep: '',
      street: '',
      number: '',
      complement: '',
      neighborhood: '',
      city: '',
      state: '',
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <>
      <div onClick={() => setIsOpen(true)}>{trigger}</div>

      {isOpen && (
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
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: '#111',
              border: '1px solid #333',
              borderRadius: 12,
              padding: 24,
              width: '90%',
              maxWidth: 900,
              color: 'white',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 18, fontWeight: 900 }}>
                Importar Leads {step === 'preview' && `(${leads.length})`}
              </div>
              <button
                onClick={() => setIsOpen(false)}
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

            {/* STEP 1: SELECT */}
            {step === 'select' && (
              <>
                <div
                  style={{
                    border: '2px dashed #2a2a2a',
                    borderRadius: 10,
                    padding: 40,
                    textAlign: 'center',
                    marginBottom: 16,
                    cursor: 'pointer',
                  }}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />

                  {selectedFile ? (
                    <>
                      <div style={{ fontSize: 14, fontWeight: 900, color: '#10b981' }}>
                        ✓ {selectedFile.name}
                      </div>
                    </>
                  ) : (
                    <>
                      <div style={{ fontSize: 24, marginBottom: 8 }}>📎</div>
                      <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>
                        Selecione um arquivo Excel
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setIsOpen(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a2a', background: 'transparent', color: 'white', cursor: 'pointer', fontWeight: 900, fontSize: 13 }}>
                    Cancelar
                  </button>

                  <button onClick={loadExcelPreview} disabled={!selectedFile || loading} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: selectedFile ? '#3b82f6' : '#1f2937', color: 'white', cursor: selectedFile ? 'pointer' : 'not-allowed', fontWeight: 900, fontSize: 13, opacity: selectedFile ? 1 : 0.5 }}>
                    {loading ? 'Analisando…' : 'Próximo'}
                  </button>
                </div>
              </>
            )}

            {/* STEP 2: MAP COLUMNS */}
            {step === 'map' && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 12, opacity: 0.7 }}>
                    SELECIONE AS COLUNAS (obrigatório: Nome e CPF):
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Nome *
                      </label>
                      <select
                        value={columnMap.name}
                        onChange={(e) => setColumnMap({ ...columnMap, name: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Selecione...</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        CPF/CNPJ *
                      </label>
                      <select
                        value={columnMap.cpf}
                        onChange={(e) => setColumnMap({ ...columnMap, cpf: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Selecione...</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Telefone
                      </label>
                      <select
                        value={columnMap.phone}
                        onChange={(e) => setColumnMap({ ...columnMap, phone: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Email
                      </label>
                      <select
                        value={columnMap.email}
                        onChange={(e) => setColumnMap({ ...columnMap, email: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Data de Nascimento
                      </label>
                      <select
                        value={columnMap.birth_date}
                        onChange={(e) => setColumnMap({ ...columnMap, birth_date: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        CEP
                      </label>
                      <select
                        value={columnMap.cep}
                        onChange={(e) => setColumnMap({ ...columnMap, cep: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Rua/Avenida
                      </label>
                      <select
                        value={columnMap.street}
                        onChange={(e) => setColumnMap({ ...columnMap, street: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Número
                      </label>
                      <select
                        value={columnMap.number}
                        onChange={(e) => setColumnMap({ ...columnMap, number: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Complemento
                      </label>
                      <select
                        value={columnMap.complement}
                        onChange={(e) => setColumnMap({ ...columnMap, complement: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Bairro
                      </label>
                      <select
                        value={columnMap.neighborhood}
                        onChange={(e) => setColumnMap({ ...columnMap, neighborhood: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Cidade
                      </label>
                      <select
                        value={columnMap.city}
                        onChange={(e) => setColumnMap({ ...columnMap, city: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>

                    <div>
                      <label style={{ fontSize: 11, fontWeight: 900, display: 'block', marginBottom: 6 }}>
                        Estado
                      </label>
                      <select
                        value={columnMap.state}
                        onChange={(e) => setColumnMap({ ...columnMap, state: e.target.value })}
                        style={{ width: '100%', padding: '8px', borderRadius: 6, border: '1px solid #2a2a2a', background: '#222', color: 'white', fontSize: 12 }}
                      >
                        <option value="">Não usar</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={resetDialog} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a2a', background: 'transparent', color: 'white', cursor: 'pointer', fontWeight: 900, fontSize: 13 }}>
                    ← Voltar
                  </button>

                  <button onClick={processWithMapping} disabled={!columnMap.name || !columnMap.cpf || loading} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: columnMap.name && columnMap.cpf ? '#3b82f6' : '#1f2937', color: 'white', cursor: columnMap.name && columnMap.cpf ? 'pointer' : 'not-allowed', fontWeight: 900, fontSize: 13, opacity: columnMap.name && columnMap.cpf ? 1 : 0.5 }}>
                    {loading ? 'Processando…' : 'Analisar'}
                  </button>
                </div>
              </>
            )}

            {/* STEP 3: PREVIEW */}
            {step === 'preview' && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 12,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ background: '#064e3b', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#a7f3d0' }}>
                        {leads.filter(l => !l.error).length}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>Válidos</div>
                    </div>
                    <div style={{ background: '#7f1d1d', padding: 12, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 24, fontWeight: 900, color: '#fecaca' }}>
                        {leads.filter(l => l.error).length}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>Com Erro</div>
                    </div>
                  </div>
                </div>

                <div style={{ border: '1px solid #2a2a2a', borderRadius: 10, maxHeight: 350, overflowY: 'auto', marginBottom: 16 }}>
                  {leads.map((lead, idx) => (
                    <div key={idx} style={{ padding: 12, borderBottom: idx < leads.length - 1 ? '1px solid #1a1a1a' : 'none', background: lead.error ? '#2a0a0a' : '#0a2a1a' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 4 }}>{lead.name}</div>
                          <div style={{ fontSize: 11, opacity: 0.7 }}>
                            CPF: {lead.cpf_cnpj} {lead.phone && `• Tel: ${lead.phone}`}
                          </div>
                          {lead.email && <div style={{ fontSize: 11, opacity: 0.7 }}>Email: {lead.email}</div>}
                          {lead.birth_date && (
                            <div style={{ fontSize: 11, opacity: 0.7 }}>
                              Nascimento: {new Date(lead.birth_date + 'T00:00:00').toLocaleDateString('pt-BR')}
                            </div>
                          )}
                          {lead.address_city && (
                            <div style={{ fontSize: 11, opacity: 0.7 }}>
                              📍 {lead.address_street} {lead.address_number && `, ${lead.address_number}`}
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          {lead.error ? (
                            <div style={{ color: '#f87171', fontSize: 11, fontWeight: 900 }}>
                              ✗ {lead.error}
                            </div>
                          ) : (
                            <div style={{ color: '#86efac', fontSize: 11, fontWeight: 900 }}>
                              ✓ OK
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ✅ VINCULAR GRUPO */}
                <div style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #222' }}>
                  <label style={{ fontSize: 12, fontWeight: 900, display: 'block', marginBottom: 8 }}>
                    📁 Vincular a um Grupo (Opcional)
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '8px',
                        borderRadius: 6,
                        border: '1px solid #2a2a2a',
                        background: '#222',
                        color: 'white',
                        fontSize: 12,
                      }}
                    >
                      <option value="">Nenhum grupo</option>
                      {groups.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                    
                    <button
                      onClick={() => setShowCreateGroupModal(true)}
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        border: '1px solid #8b5cf6',
                        background: 'transparent',
                        color: '#d8b4fe',
                        cursor: 'pointer',
                        fontWeight: 900,
                        fontSize: 11,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      + Novo Grupo
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setStep('map')} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #2a2a2a', background: 'transparent', color: 'white', cursor: 'pointer', fontWeight: 900, fontSize: 13 }}>
                    ← Voltar
                  </button>

                  <button onClick={createAllLeads} disabled={leads.filter(l => !l.error).length === 0 || importing} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: leads.filter(l => !l.error).length > 0 ? '#10b981' : '#1f2937', color: 'white', cursor: leads.filter(l => !l.error).length > 0 ? 'pointer' : 'not-allowed', fontWeight: 900, fontSize: 13, opacity: leads.filter(l => !l.error).length > 0 ? 1 : 0.5 }}>
                    {importing ? 'Criando…' : `+ Criar (${leads.filter(l => !l.error).length})`}
                  </button>
                </div>
              </>
            )}

            {/* STEP 4: SUCCESS */}
            {step === 'success' && (
              <>
                <div style={{ background: '#064e3b', color: '#a7f3d0', padding: 20, borderRadius: 10, textAlign: 'center', marginBottom: 16 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>Importação Concluída!</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    {leads.filter(l => !l.error).length} leads criados com sucesso
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => setIsOpen(false)} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#10b981', color: 'white', cursor: 'pointer', fontWeight: 900, fontSize: 13 }}>
                    Fechar
                  </button>
                </div>
              </>
            )}

            {/* ✅ MODAL CRIAR GRUPO */}
            {showCreateGroupModal && (
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
                  zIndex: 10000,
                }}
                onClick={() => setShowCreateGroupModal(false)}
              >
                <div
                  style={{
                    background: '#111',
                    border: '1px solid #333',
                    borderRadius: 12,
                    padding: 24,
                    width: '90%',
                    maxWidth: 400,
                    color: 'white',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 16 }}>
                    Novo Grupo
                  </div>

                  <input
                    type="text"
                    placeholder="Nome do grupo…"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && newGroupName.trim()) {
                        createNewGroup(newGroupName.trim())
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '10px',
                      borderRadius: 6,
                      border: '1px solid #2a2a2a',
                      background: '#222',
                      color: 'white',
                      fontSize: 12,
                      marginBottom: 12,
                      boxSizing: 'border-box',
                    }}
                    autoFocus
                  />

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => setShowCreateGroupModal(false)}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 6,
                        border: '1px solid #2a2a2a',
                        background: 'transparent',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      Cancelar
                    </button>

                    <button
                      onClick={() => {
                        if (newGroupName.trim()) {
                          createNewGroup(newGroupName.trim())
                        }
                      }}
                      disabled={!newGroupName.trim()}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 6,
                        border: 'none',
                        background: newGroupName.trim() ? '#8b5cf6' : '#1f2937',
                        color: 'white',
                        cursor: newGroupName.trim() ? 'pointer' : 'not-allowed',
                        fontWeight: 900,
                        fontSize: 12,
                        opacity: newGroupName.trim() ? 1 : 0.5,
                      }}
                    >
                      Criar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}