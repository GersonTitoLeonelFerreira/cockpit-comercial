'use client'

import React, { useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { supabaseBrowser } from '../../lib/supabaseBrowser'

type DeletedLeadConflict = {
  row: number
  lead_id: string
  name: string | null
  document: string | null
  phone: string | null
  email: string | null
  matched_by: 'document' | 'phone' | 'email'
  deleted_at: string
}

type ActiveLeadConflict = {
  row: number
  lead_id: string
  name: string | null
  document: string | null
  phone: string | null
  email: string | null
  matched_by: 'document' | 'phone' | 'email'
}

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
  deletedConflict?: DeletedLeadConflict | null
  activeConflict?: ActiveLeadConflict | null
}

type LeadGroup = {
  id: string
  name: string
}

type ImportSummary = {
  created: number
  updated: number
  reactivated?: number
  errors: Array<{ row: number; error: string }>
}

const UI = {
  overlay: 'rgba(2,6,23,0.78)',
  pageBg: '#090b0f',
  modalBg: '#0d0f14',
  surface: '#111318',
  surfaceSoft: '#141722',
  border: '#1a1d2e',
  borderSoft: '#232842',
  text: '#edf2f7',
  muted: '#8fa3bc',
  faint: '#546070',
  blue: '#3b82f6',
  blueSoft: '#93c5fd',
  greenBg: 'rgba(22,163,74,0.12)',
  greenBorder: 'rgba(34,197,94,0.28)',
  greenText: '#86efac',
  redBg: 'rgba(127,29,29,0.36)',
  redBorder: 'rgba(239,68,68,0.30)',
  redText: '#fecaca',
  amberBg: 'rgba(245,158,11,0.14)',
  amberBorder: 'rgba(245,158,11,0.38)',
  amberText: '#fef3c7',
  purpleBorder: 'rgba(168,85,247,0.45)',
  purpleText: '#d8b4fe',
  radius: 10,
  radiusLarge: 16,
} as const

const onlyDigits = (val: unknown) => String(val || '').replace(/\D/g, '')

function hasRepeatedDigits(value: string) {
  return /^(\d)\1+$/.test(value)
}

function isValidCPF(value: string) {
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

function isValidCNPJ(value: string) {
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

function normalizeDocumentInput(value: unknown) {
  const digits = onlyDigits(value)

  if (!digits) return ''

  if (digits.length === 11 && isValidCPF(digits)) return digits
  if (digits.length === 14 && isValidCNPJ(digits)) return digits

  if (digits.length < 11) {
    const cpfCandidate = digits.padStart(11, '0')
    if (isValidCPF(cpfCandidate)) return cpfCandidate
  }

  if (digits.length > 11 && digits.length < 14) {
    const cnpjCandidate = digits.padStart(14, '0')
    if (isValidCNPJ(cnpjCandidate)) return cnpjCandidate
  }

  return digits
}

const validators = {
  isDocument: (val: unknown): boolean => {
    const str = normalizeDocumentInput(val)
    return isValidCPF(str) || isValidCNPJ(str)
  },
  isEmail: (val: unknown): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val || '').trim())
  },
  isPhone: (val: unknown): boolean => {
    const str = onlyDigits(val)
    return str.length >= 10 && str.length <= 11 && /^\d+$/.test(str)
  },
  isCEP: (val: unknown): boolean => {
    const str = onlyDigits(val)
    return str.length === 8 && /^\d+$/.test(str)
  },
}

const normalizeEmail = (val: unknown): string | null => {
  const str = String(val || '').trim().toLowerCase()
  return str || null
}

const cleanDate = (val: unknown): string | null => {
  if (val === null || val === undefined || val === '') return null

  if (typeof val === 'number') {
    const parsed = XLSX.SSF.parse_date_code(val)
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
    }
  }

  const str = String(val).trim()
  if (!str) return null

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str
  }

  const datePart = str.split(' ')[0]
  const parts = datePart.split(/[/-]/)

  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const [year, month, day] = parts
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }

    const [day, month, year] = parts
    const fullYear = year.length === 2 ? `19${year}` : year
    return `${fullYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return null
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
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
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([])

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
  const [deletedConflicts, setDeletedConflicts] = useState<DeletedLeadConflict[]>([])
  const [keepDeletedBlocked, setKeepDeletedBlocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [importSummary, setImportSummary] = useState<ImportSummary | null>(null)

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

  const loadGroups = async () => {
    try {
      const { data } = await supabase
        .from('lead_groups')
        .select('id, name')
        .eq('company_id', companyId)
        .is('archived_at', null)
        .order('name', { ascending: true })

      setGroups(data || [])
    } catch (e) {
      console.error('Erro ao carregar grupos:', e)
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
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

      if (rows.length === 0) {
        setError('Planilha vazia')
        return
      }

      const cols = Object.keys(rows[0])
      setHeaders(cols)
      setRawRows(rows)
      await loadGroups()
      setStep('map')
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Erro ao ler arquivo'))
    } finally {
      setLoading(false)
    }
  }

  const createNewGroup = async (groupName: string) => {
    try {
      setError(null)

      const { data, error } = await supabase
        .from('lead_groups')
        .insert({
          company_id: companyId,
          name: groupName,
          created_by: userId,
        })
        .select()
        .single()

      if (error) throw error

      setGroups((prev) => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setSelectedGroup(data.id)
      setShowCreateGroupModal(false)
      setNewGroupName('')
    } catch (e: unknown) {
      setError(`Erro ao criar grupo: ${getErrorMessage(e, 'Erro desconhecido')}`)
    }
  }

  const checkImportConflicts = async (rowsToCheck: LeadData[]) => {
    if (rowsToCheck.length === 0) {
      return {
        deleted: [] as DeletedLeadConflict[],
        active: [] as ActiveLeadConflict[],
      }
    }

    const response = await fetch('/api/import/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        rows: rowsToCheck,
        group_id: selectedGroup || null,
        check_deleted_conflicts_only: true,
      }),
    })

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(result?.error || 'Erro ao verificar conflitos de importação.')
    }

    return {
      deleted: Array.isArray(result?.deleted_conflicts)
        ? (result.deleted_conflicts as DeletedLeadConflict[])
        : [],
      active: Array.isArray(result?.active_conflicts)
        ? (result.active_conflicts as ActiveLeadConflict[])
        : [],
    }
  }

  const processWithMapping = async () => {
    if (!columnMap.name || !columnMap.cpf) {
      setError('Nome e CPF/CNPJ são obrigatórios')
      return
    }

    setLoading(true)
    setError(null)
    setKeepDeletedBlocked(false)

    try {
      const docsInSheet = new Set<string>()
      const duplicateDocs = new Set<string>()
      const phonesInSheet = new Set<string>()
      const duplicatePhones = new Set<string>()
      const emailsInSheet = new Set<string>()
      const duplicateEmails = new Set<string>()

      for (const row of rawRows) {
        const doc = normalizeDocumentInput(row[columnMap.cpf])
        const phone = columnMap.phone ? onlyDigits(row[columnMap.phone]) : ''
        const email = columnMap.email ? normalizeEmail(row[columnMap.email]) : null

        if (doc && validators.isDocument(doc)) {
          if (docsInSheet.has(doc)) duplicateDocs.add(doc)
          else docsInSheet.add(doc)
        }

        if (phone && validators.isPhone(phone)) {
          if (phonesInSheet.has(phone)) duplicatePhones.add(phone)
          else phonesInSheet.add(phone)
        }

        if (email && validators.isEmail(email)) {
          if (emailsInSheet.has(email)) duplicateEmails.add(email)
          else emailsInSheet.add(email)
        }
      }

      const leadsData: LeadData[] = []

      for (let rowIndex = 0; rowIndex < rawRows.length; rowIndex++) {
        const row = rawRows[rowIndex]
        const rowNumber = rowIndex + 2

        const rawName = String(row[columnMap.name] || '').trim()
        const rawDoc = normalizeDocumentInput(row[columnMap.cpf])
        const rawPhone = columnMap.phone ? onlyDigits(row[columnMap.phone]) : ''
        const rawEmail = columnMap.email ? normalizeEmail(row[columnMap.email]) : null

        const validPhone = rawPhone && validators.isPhone(rawPhone) ? rawPhone : null
        const validEmail = rawEmail && validators.isEmail(rawEmail) ? rawEmail : null

        let rowError: string | null = null

        if (!rawName) {
          rowError = 'Nome vazio'
        } else if (!rawDoc || !validators.isDocument(rawDoc)) {
          rowError = 'CPF/CNPJ inválido'
        } else if (duplicateDocs.has(rawDoc)) {
          rowError = 'CPF/CNPJ duplicado na planilha'
        } else if (validEmail && duplicateEmails.has(validEmail)) {
          rowError = 'E-mail duplicado na planilha'
        } else if (validPhone && duplicatePhones.has(validPhone)) {
          rowError = 'Telefone duplicado na planilha'
        }

        const birth_date = columnMap.birth_date ? cleanDate(row[columnMap.birth_date]) : null
        const cep = columnMap.cep ? onlyDigits(row[columnMap.cep]) || null : null
        const street = columnMap.street ? String(row[columnMap.street] || '').trim() || null : null
        const number = columnMap.number ? String(row[columnMap.number] || '').trim() || null : null
        const complement = columnMap.complement
          ? String(row[columnMap.complement] || '').trim() || null
          : null
        const neighborhood = columnMap.neighborhood
          ? String(row[columnMap.neighborhood] || '').trim() || null
          : null
        const city = columnMap.city ? String(row[columnMap.city] || '').trim() || null : null
        const state = columnMap.state ? String(row[columnMap.state] || '').trim() || null : null

        leadsData.push({
          rowNumber,
          name: rawName,
          cpf_cnpj: rawDoc,
          phone: validPhone,
          email: validEmail,
          birth_date,
          address_cep: cep && validators.isCEP(cep) ? cep : null,
          address_street: street,
          address_number: number,
          address_complement: complement,
          address_neighborhood: neighborhood,
          address_city: city,
          address_state: state,
          error: rowError,
        })
      }

      const validRows = leadsData.filter((lead) => !lead.error)
      const importConflicts = await checkImportConflicts(validRows)

      const deletedConflictByRow = new Map(
        importConflicts.deleted.map((conflict) => [conflict.row, conflict])
      )

      const activeConflictByRow = new Map(
        importConflicts.active.map((conflict) => [conflict.row, conflict])
      )

      const leadsWithConflicts = leadsData.map((lead) => {
        const activeConflict = activeConflictByRow.get(lead.rowNumber)
        const deletedConflict = deletedConflictByRow.get(lead.rowNumber)

        if (activeConflict) {
          return {
            ...lead,
            activeConflict,
            deletedConflict: null,
            error: 'Lead já ativo no sistema. Importação duplicada bloqueada.',
          }
        }

        if (deletedConflict) {
          return {
            ...lead,
            activeConflict: null,
            deletedConflict,
            error: 'Lead excluído encontrado. Escolha se deseja reativar.',
          }
        }

        return {
          ...lead,
          activeConflict: null,
          deletedConflict: null,
        }
      })

      setDeletedConflicts(importConflicts.deleted)
      setLeads(leadsWithConflicts)
      setStep('preview')
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Erro ao processar'))
    } finally {
      setLoading(false)
    }
  }

  const submitImport = async (reactivateDeletedLeads: boolean) => {
    const conflictRows = new Set(deletedConflicts.map((conflict) => conflict.row))

    const leadsToImport = leads.filter((lead) => {
      if (!lead.error) return true
      return reactivateDeletedLeads && conflictRows.has(lead.rowNumber)
    })

    if (leadsToImport.length === 0) {
      setError('Nenhum lead válido para importar.')
      return
    }

    if (deletedConflicts.length > 0 && !reactivateDeletedLeads && !keepDeletedBlocked) {
      setError('Escolha se deseja reativar ou manter bloqueados os leads excluídos antes de importar.')
      return
    }

    setImporting(true)
    setError(null)

    try {
      const response = await fetch('/api/import/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rows: leadsToImport,
          group_id: selectedGroup || null,
          reactivate_deleted_leads: reactivateDeletedLeads,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        throw new Error(result?.error || 'Erro ao importar leads')
      }

      setImportSummary({
        created: Number(result?.created || 0),
        updated: Number(result?.updated || 0),
        reactivated: Number(result?.reactivated || 0),
        errors: Array.isArray(result?.errors) ? result.errors : [],
      })

      setStep('success')
      onImported()
    } catch (e: unknown) {
      setError(getErrorMessage(e, 'Erro ao importar leads'))
    } finally {
      setImporting(false)
    }
  }

  const createAllLeads = async () => {
    await submitImport(false)
  }

  const reactivateAndImportDeletedLeads = async () => {
    await submitImport(true)
  }

  const keepDeletedLeadsBlocked = () => {
    setKeepDeletedBlocked(true)
    setError('Leads excluídos mantidos bloqueados. Você pode importar apenas os leads válidos da planilha.')
  }

  const resetDialog = () => {
    setStep('select')
    setSelectedFile(null)
    setHeaders([])
    setRawRows([])
    setLeads([])
    setDeletedConflicts([])
    setError(null)
    setImportSummary(null)
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
          background: UI.overlay,
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: 20,
        }}
          onClick={() => setIsOpen(false)}
        >
          <div
            style={{
              background: `linear-gradient(180deg, ${UI.surface} 0%, ${UI.modalBg} 100%)`,
              border: `1px solid ${UI.border}`,
              borderRadius: UI.radiusLarge,
              padding: 0,
              width: '92%',
              maxWidth: 920,
              color: UI.text,
              maxHeight: '90vh',
              overflow: 'hidden',
              boxShadow: '0 24px 80px rgba(0,0,0,0.55)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
                        <div
              style={{
                padding: 24,
                maxHeight: '90vh',
                overflowY: 'auto',
              }}
            >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 16,
                marginBottom: 22,
                paddingBottom: 16,
                borderBottom: `1px solid ${UI.border}`,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 900,
                    letterSpacing: '0.12em',
                    color: UI.blueSoft,
                    textTransform: 'uppercase',
                    marginBottom: 6,
                  }}
                >
                  Importação inteligente
                </div>

                <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.03em' }}>
                  Importar Leads {step === 'preview' && `(${leads.length})`}
                </div>

                <div style={{ marginTop: 6, color: UI.muted, fontSize: 12 }}>
                  Valide dados, evite duplicidade e reative leads excluídos com segurança.
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  border: `1px solid ${UI.border}`,
                  background: UI.modalBg,
                  color: UI.muted,
                  cursor: 'pointer',
                  fontSize: 20,
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                ×
              </button>
            </div>

            {error && (
              <div
                style={{
                  background: UI.redBg,
                  color: UI.redText,
                  border: `1px solid ${UI.redBorder}`,
                  padding: 12,
                  borderRadius: UI.radius,
                  marginBottom: 16,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            )}

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
                    <div style={{ fontSize: 14, fontWeight: 900, color: '#10b981' }}>
                      ✓ {selectedFile.name}
                    </div>
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
                  <button
                    onClick={() => setIsOpen(false)}
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
                    onClick={loadExcelPreview}
                    disabled={!selectedFile || loading}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: selectedFile ? '#3b82f6' : '#1f2937',
                      color: 'white',
                      cursor: selectedFile ? 'pointer' : 'not-allowed',
                      fontWeight: 900,
                      fontSize: 13,
                      opacity: selectedFile ? 1 : 0.5,
                    }}
                  >
                    {loading ? 'Analisando…' : 'Próximo'}
                  </button>
                </div>
              </>
            )}

            {step === 'map' && (
              <>
                <div style={{ marginBottom: 20 }}>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      marginBottom: 12,
                      opacity: 0.7,
                    }}
                  >
                    SELECIONE AS COLUNAS (obrigatório: Nome e CPF/CNPJ):
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                      gap: 12,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Nome *
                      </label>
                      <select
                        value={columnMap.name}
                        onChange={(e) => setColumnMap({ ...columnMap, name: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Selecione...</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        CPF/CNPJ *
                      </label>
                      <select
                        value={columnMap.cpf}
                        onChange={(e) => setColumnMap({ ...columnMap, cpf: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Selecione...</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Telefone
                      </label>
                      <select
                        value={columnMap.phone}
                        onChange={(e) => setColumnMap({ ...columnMap, phone: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Email
                      </label>
                      <select
                        value={columnMap.email}
                        onChange={(e) => setColumnMap({ ...columnMap, email: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Data de Nascimento
                      </label>
                      <select
                        value={columnMap.birth_date}
                        onChange={(e) =>
                          setColumnMap({ ...columnMap, birth_date: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        CEP
                      </label>
                      <select
                        value={columnMap.cep}
                        onChange={(e) => setColumnMap({ ...columnMap, cep: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Rua/Avenida
                      </label>
                      <select
                        value={columnMap.street}
                        onChange={(e) => setColumnMap({ ...columnMap, street: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Número
                      </label>
                      <select
                        value={columnMap.number}
                        onChange={(e) => setColumnMap({ ...columnMap, number: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Complemento
                      </label>
                      <select
                        value={columnMap.complement}
                        onChange={(e) =>
                          setColumnMap({ ...columnMap, complement: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Bairro
                      </label>
                      <select
                        value={columnMap.neighborhood}
                        onChange={(e) =>
                          setColumnMap({ ...columnMap, neighborhood: e.target.value })
                        }
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Cidade
                      </label>
                      <select
                        value={columnMap.city}
                        onChange={(e) => setColumnMap({ ...columnMap, city: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        style={{
                          fontSize: 11,
                          fontWeight: 900,
                          display: 'block',
                          marginBottom: 6,
                        }}
                      >
                        Estado
                      </label>
                      <select
                        value={columnMap.state}
                        onChange={(e) => setColumnMap({ ...columnMap, state: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '8px',
                          borderRadius: 6,
                          border: '1px solid #2a2a2a',
                          background: '#222',
                          color: 'white',
                          fontSize: 12,
                        }}
                      >
                        <option value="">Não usar</option>
                        {headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={resetDialog}
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
                    onClick={processWithMapping}
                    disabled={!columnMap.name || !columnMap.cpf || loading}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: columnMap.name && columnMap.cpf ? '#3b82f6' : '#1f2937',
                      color: 'white',
                      cursor: columnMap.name && columnMap.cpf ? 'pointer' : 'not-allowed',
                      fontWeight: 900,
                      fontSize: 13,
                      opacity: columnMap.name && columnMap.cpf ? 1 : 0.5,
                    }}
                  >
                    {loading ? 'Processando…' : 'Analisar'}
                  </button>
                </div>
              </>
            )}

{step === 'preview' && (
              <>

                {deletedConflicts.length > 0 && (
                  <div
                    style={{
                      background: UI.surfaceSoft,
                      border: `1px solid ${UI.amberBorder}`,
                      borderLeft: `4px solid ${UI.amberText}`,
                      color: UI.text,
                      borderRadius: UI.radius,
                      padding: 14,
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 900, marginBottom: 4 }}>
                          Leads excluídos encontrados
                        </div>
                        <div style={{ fontSize: 12, color: UI.muted, lineHeight: 1.5 }}>
                          Existem {deletedConflicts.length} lead(s) já cadastrados, mas excluídos.
                          Decida se deseja reativá-los ou manter esses registros bloqueados.
                        </div>
                      </div>

                      <span
                        style={{
                          height: 24,
                          padding: '4px 9px',
                          borderRadius: 999,
                          background: UI.amberBg,
                          color: UI.amberText,
                          border: `1px solid ${UI.amberBorder}`,
                          fontSize: 11,
                          fontWeight: 900,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Decisão necessária
                      </span>
                    </div>

                    <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                      {deletedConflicts.map((conflict) => (
                        <div
                          key={conflict.lead_id}
                          style={{
                            background: UI.modalBg,
                            border: `1px solid ${UI.border}`,
                            borderRadius: UI.radius,
                            padding: 10,
                            fontSize: 12,
                          }}
                        >
                          <strong>{conflict.name || 'Lead sem nome'}</strong>
                          <div style={{ color: UI.muted, marginTop: 3 }}>
                            Linha {conflict.row} • CPF/CNPJ: {conflict.document || '—'} • Tel:{' '}
                            {conflict.phone || '—'}
                          </div>
                          <div style={{ color: UI.faint, marginTop: 3 }}>
                            Excluído em: {new Date(conflict.deleted_at).toLocaleString('pt-BR')}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                      <button
                        onClick={keepDeletedLeadsBlocked}
                        disabled={importing}
                        style={{
                          padding: '9px 14px',
                          borderRadius: UI.radius,
                          border: `1px solid ${UI.amberBorder}`,
                          background: keepDeletedBlocked ? UI.amberBg : 'transparent',
                          color: UI.amberText,
                          cursor: importing ? 'not-allowed' : 'pointer',
                          fontWeight: 900,
                          fontSize: 12,
                          opacity: importing ? 0.5 : 1,
                        }}
                      >
                        {keepDeletedBlocked ? 'Mantidos bloqueados' : 'Não reativar'}
                      </button>

                      <button
                        onClick={reactivateAndImportDeletedLeads}
                        disabled={importing}
                        style={{
                          padding: '9px 14px',
                          borderRadius: UI.radius,
                          border: `1px solid ${UI.greenBorder}`,
                          background: UI.greenBg,
                          color: UI.greenText,
                          cursor: importing ? 'not-allowed' : 'pointer',
                          fontWeight: 900,
                          fontSize: 12,
                          opacity: importing ? 0.5 : 1,
                        }}
                      >
                        {importing ? 'Reativando...' : 'Reativar e importar'}
                      </button>
                    </div>
                  </div>
                )}

<div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 10,
                    marginBottom: 0,
                    border: `1px solid ${UI.border}`,
                    borderBottom: 'none',
                    borderRadius: `${UI.radius}px ${UI.radius}px 0 0`,
                    background: UI.surfaceSoft,
                    padding: 10,
                  }}
                >
                  <div
                    style={{
                      background: UI.modalBg,
                      border: `1px solid ${UI.border}`,
                      borderRadius: UI.radius,
                      padding: 12,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: UI.muted,
                        fontWeight: 900,
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Novos para importar
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: UI.greenText }}>
                      {leads.filter((l) => !l.error).length}
                    </div>
                  </div>

                  <div
                    style={{
                      background: UI.modalBg,
                      border: `1px solid ${UI.border}`,
                      borderRadius: UI.radius,
                      padding: 12,
                      textAlign: 'center',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        color: UI.muted,
                        fontWeight: 900,
                        marginBottom: 6,
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                      }}
                    >
                      Bloqueados / atenção
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 900, color: UI.amberText }}>
                      {leads.filter((l) => l.error).length}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    border: `1px solid ${UI.border}`,
                    borderRadius: UI.radius,
                    maxHeight: 350,
                    overflowY: 'auto',
                    marginBottom: 16,
                    background: UI.modalBg,
                  }}
                >
                  {leads.map((lead, idx) => {
                    const tone = lead.activeConflict
                      ? 'active'
                      : lead.deletedConflict
                        ? 'deleted'
                        : lead.error
                          ? 'error'
                          : 'ok'

                    const borderColor =
                      tone === 'ok'
                        ? UI.greenBorder
                        : tone === 'deleted'
                          ? UI.amberBorder
                          : UI.redBorder

                          const label =
                          tone === 'ok'
                            ? 'Pronto para importar'
                            : tone === 'deleted'
                              ? 'Aguardando decisão'
                              : tone === 'active'
                                ? 'Já existe ativo'
                                : 'Bloqueado'

                    const labelColor =
                      tone === 'ok'
                        ? UI.greenText
                        : tone === 'deleted'
                          ? UI.amberText
                          : UI.redText

                    return (
                      <div
                        key={idx}
                        style={{
                          padding: 12,
                          borderBottom: idx < leads.length - 1 ? `1px solid ${UI.border}` : 'none',
                          background: UI.surface,
                          borderLeft: `3px solid ${borderColor}`,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                          <div>
                            <div style={{ fontWeight: 900, fontSize: 13, marginBottom: 4 }}>
                              {lead.name}
                            </div>
                            <div style={{ fontSize: 11, color: UI.muted }}>
                              CPF/CNPJ: {lead.cpf_cnpj} {lead.phone && `• Tel: ${lead.phone}`}
                            </div>
                            {lead.email && (
                              <div style={{ fontSize: 11, color: UI.muted }}>Email: {lead.email}</div>
                            )}
                            {lead.birth_date && (
                              <div style={{ fontSize: 11, color: UI.muted }}>
                                Nascimento:{' '}
                                {new Date(`${lead.birth_date}T00:00:00`).toLocaleDateString('pt-BR')}
                              </div>
                            )}
                            {lead.address_city && (
                              <div style={{ fontSize: 11, color: UI.muted }}>
                                {lead.address_street} {lead.address_number && `, ${lead.address_number}`}
                              </div>
                            )}
                          </div>

                          <div style={{ textAlign: 'right', minWidth: 150 }}>
                            <div style={{ color: labelColor, fontSize: 11, fontWeight: 900 }}>
                              {label}
                            </div>
                            {lead.error && (
                              <div style={{ color: UI.muted, fontSize: 11, marginTop: 4 }}>
                                {lead.error}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div
                  style={{
                    marginBottom: 16,
                    paddingBottom: 16,
                    borderBottom: `1px solid ${UI.border}`,
                  }}
                >
                  <label
                    style={{
                      fontSize: 12,
                      fontWeight: 900,
                      display: 'block',
                      marginBottom: 8,
                      color: UI.text,
                    }}
                  >
                    Vincular a um grupo
                  </label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <select
                      value={selectedGroup}
                      onChange={(e) => setSelectedGroup(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '9px 10px',
                        borderRadius: UI.radius,
                        border: `1px solid ${UI.border}`,
                        background: UI.surface,
                        color: UI.text,
                        fontSize: 12,
                      }}
                    >
                      <option value="">Nenhum grupo</option>
                      {groups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.name}
                        </option>
                      ))}
                    </select>

                    <button
                      onClick={() => setShowCreateGroupModal(true)}
                      style={{
                        padding: '9px 12px',
                        borderRadius: UI.radius,
                        border: `1px solid ${UI.purpleBorder}`,
                        background: 'transparent',
                        color: UI.purpleText,
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
                  <button
                    onClick={() => setStep('map')}
                    style={{
                      padding: '10px 18px',
                      borderRadius: UI.radius,
                      border: `1px solid ${UI.border}`,
                      background: UI.surface,
                      color: UI.text,
                      cursor: 'pointer',
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    ← Voltar
                  </button>

                  <button
                    onClick={createAllLeads}
                    disabled={
                      importing ||
                      (deletedConflicts.length > 0 && !keepDeletedBlocked) ||
                      leads.filter((l) => !l.error).length === 0
                    }
                    style={{
                      padding: '10px 18px',
                      borderRadius: UI.radius,
                      border: `1px solid ${UI.greenBorder}`,
                      background: leads.filter((l) => !l.error).length > 0 ? UI.greenBg : UI.surface,
                      color: leads.filter((l) => !l.error).length > 0 ? UI.greenText : UI.faint,
                      cursor: leads.filter((l) => !l.error).length > 0 ? 'pointer' : 'not-allowed',
                      fontWeight: 900,
                      fontSize: 13,
                      opacity: leads.filter((l) => !l.error).length > 0 ? 1 : 0.5,
                    }}
                  >
                    {importing ? 'Importando…' : `Importar novos (${leads.filter((l) => !l.error).length})`}
                  </button>
                </div>
              </>
            )}

            {step === 'success' && (
              <>
                <div
                  style={{
                    background: '#064e3b',
                    color: '#a7f3d0',
                    padding: 20,
                    borderRadius: 10,
                    textAlign: 'center',
                    marginBottom: 16,
                  }}
                >
                  <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 4 }}>
                    Importação Concluída
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.85 }}>
                    Criados: {importSummary?.created ?? 0} • Atualizados: {importSummary?.updated ?? 0}
                  </div>
                  {importSummary?.errors?.length ? (
                    <div style={{ fontSize: 12, opacity: 0.85, marginTop: 6 }}>
                      Linhas com erro: {importSummary.errors.length}
                    </div>
                  ) : null}
                </div>

                {importSummary?.errors?.length ? (
                  <div
                    style={{
                      border: '1px solid #3a1515',
                      background: '#130a0a',
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 16,
                      maxHeight: 220,
                      overflowY: 'auto',
                    }}
                  >
                    <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8, color: '#fecaca' }}>
                      Erros retornados pela API
                    </div>
                    {importSummary.errors.map((item, idx) => (
                      <div key={idx} style={{ fontSize: 12, color: '#fca5a5', marginBottom: 6 }}>
                        Linha {item.row}: {item.error}
                      </div>
                    ))}
                  </div>
                ) : null}

                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button
                    onClick={() => {
                      resetDialog()
                      setIsOpen(false)
                    }}
                    style={{
                      padding: '10px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background: '#10b981',
                      color: 'white',
                      cursor: 'pointer',
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    Fechar
                  </button>
                </div>
              </>
            )}

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
                    onKeyDown={(e) => {
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
        </div>
      )}
    </>
  )
}