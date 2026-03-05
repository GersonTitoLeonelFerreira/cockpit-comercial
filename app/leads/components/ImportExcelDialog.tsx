'use client'

import * as React from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

type ImportRow = {
  name: string
  phone: string | null
  email: string | null
  tipo: 'PF' | 'PJ'
  cpf: string | null
  cnpj: string | null
  razao_social: string | null
  cep: string | null
  rua: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  pais: string | null
}

type Pipeline = {
  id: string
  name: string
  key: string
  description: string | null
  is_default?: boolean
  allow_create?: boolean
}

type Stage = {
  id: string
  name: string
  key: string
  position: number
}

type ProfileKeyRow = {
  cpf: string | null
  cnpj: string | null
}

function onlyDigits(v: any) {
  return String(v ?? '').replace(/\D/g, '')
}
function normStr(v: any) {
  const s = String(v ?? '').trim()
  return s.length ? s : null
}
function normUF(v: any) {
  const s = String(v ?? '').trim().toUpperCase()
  return s.length ? s.slice(0, 2) : null
}
function normKey(s: any) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

function getAnyLoose(obj: any, keys: string[]) {
  if (!obj) return null
  const entries = Object.entries(obj)
  const map = new Map<string, any>()
  for (const [k, v] of entries) map.set(normKey(k), v)

  for (const k of keys) {
    const v = map.get(normKey(k))
    if (v != null && String(v).trim() !== '') return v
  }
  return null
}

function mapRowToImportRow(raw: any): ImportRow {
  const name =
    (normStr(getAnyLoose(raw, ['nome', 'lead', 'cliente', 'contato', 'responsavel', 'responsável'])) as string | null) ?? ''

  const phoneRaw = getAnyLoose(raw, ['telefone', 'celular', 'whatsapp', 'fone', 'phone', 'tel'])
  const emailRaw = getAnyLoose(raw, ['email', 'e-mail', 'mail'])

  const documentoRaw = getAnyLoose(raw, ['documento', 'doc', 'cpf/cnpj', 'cpf cnpj', 'cpfcnpj', 'cnpj/cpf', 'nr documento'])
  const cpfRaw = getAnyLoose(raw, ['cpf'])
  const cnpjRaw = getAnyLoose(raw, ['cnpj'])
  const razaoRaw = getAnyLoose(raw, ['razao_social', 'razao social', 'razão social', 'empresa', 'nome empresa'])

  const cepRaw = getAnyLoose(raw, ['cep'])
  const ruaRaw = getAnyLoose(raw, ['rua', 'logradouro', 'endereco', 'endereço'])
  const numeroRaw = getAnyLoose(raw, ['numero', 'número', 'num'])
  const complRaw = getAnyLoose(raw, ['complemento', 'comp'])
  const bairroRaw = getAnyLoose(raw, ['bairro'])
  const cidadeRaw = getAnyLoose(raw, ['cidade', 'municipio', 'município'])
  const ufRaw = getAnyLoose(raw, ['uf', 'estado'])
  const paisRaw = getAnyLoose(raw, ['pais', 'país', 'country'])

  const cpfDigits = onlyDigits(cpfRaw)
  const cnpjDigits = onlyDigits(cnpjRaw)
  const docDigits = onlyDigits(documentoRaw)

  const inferredCpf = !cpfDigits && docDigits.length === 11 ? docDigits : cpfDigits || null
  const inferredCnpj = !cnpjDigits && docDigits.length === 14 ? docDigits : cnpjDigits || null

  const tipoRaw = getAnyLoose(raw, ['tipo'])
  const tipoFromSheet: 'PF' | 'PJ' | null =
    tipoRaw != null ? (String(tipoRaw).toUpperCase() === 'PJ' ? 'PJ' : 'PF') : null
  const tipo: 'PF' | 'PJ' = tipoFromSheet ?? (inferredCnpj ? 'PJ' : 'PF')

  return {
    name,
    phone: onlyDigits(phoneRaw) || null,
    email: normStr(emailRaw),
    tipo,
    cpf: inferredCpf || null,
    cnpj: inferredCnpj || null,
    razao_social: normStr(razaoRaw),

    cep: onlyDigits(cepRaw) || null,
    rua: normStr(ruaRaw),
    numero: normStr(numeroRaw),
    complemento: normStr(complRaw),
    bairro: normStr(bairroRaw),
    cidade: normStr(cidadeRaw),
    uf: normUF(ufRaw),
    pais: normStr(paisRaw) ?? 'Brasil',
  }
}

function sanitizeRow(r: ImportRow): ImportRow {
  const cpfDigits = r.cpf ? onlyDigits(r.cpf) : ''
  const cnpjDigits = r.cnpj ? onlyDigits(r.cnpj) : ''
  const phoneDigits = r.phone ? onlyDigits(r.phone) : ''

  const cpf =
    cpfDigits.length === 11 && !/^0+$/.test(cpfDigits) && cpfDigits !== '00000000000' ? cpfDigits : null
  const cnpj =
    cnpjDigits.length === 14 && !/^0+$/.test(cnpjDigits) && cnpjDigits !== '00000000000000' ? cnpjDigits : null

  const phone =
    phoneDigits && phoneDigits.length >= 10 && phoneDigits.length <= 13 && !/^1+$/.test(phoneDigits) ? phoneDigits : null

  const cepDigits = r.cep ? onlyDigits(r.cep) : ''
  const cep = cepDigits.length === 8 ? cepDigits : null

  const name = normStr(r.name) ?? ''

  return {
    ...r,
    name,
    phone,
    cpf,
    cnpj,
    cep,
    uf: r.uf ? r.uf.slice(0, 2) : null,
    email: r.email ? String(r.email).trim() : null,
  }
}

function validateRowSoft(r0: ImportRow) {
  const r = sanitizeRow(r0)
  const errs: string[] = []
  const warns: string[] = []

  if (!r.name || !r.name.trim()) errs.push('Nome é obrigatório.')
  if (!r.phone) errs.push('Telefone é obrigatório.')
  if (!r.email) errs.push('E-mail é obrigatório.')

  if (r.tipo === 'PF') {
    if (!r.cpf) errs.push('CPF é obrigatório (11 dígitos).')
  } else {
    if (!r.cnpj) errs.push('CNPJ é obrigatório (14 dígitos).')
    if (!r.razao_social) errs.push('Razão Social é obrigatória para PJ.')
  }

  if (String(r0.name ?? '').includes('DADOS REMOVIDOS')) errs.push('Linha inválida: DADOS REMOVIDOS.')

  if (r0.cep && !r.cep) warns.push('CEP inválido: será ignorado.')

  return { errs, warns, sanitized: r }
}

// ---------- leitura inteligente (header pode estar no meio) ----------

const HEADER_SYNONYMS: Record<string, string[]> = {
  name: ['nome', 'cliente', 'lead', 'contato', 'responsavel', 'responsável'],
  phone: ['telefone', 'celular', 'whatsapp', 'fone', 'tel', 'phone'],
  email: ['email', 'e-mail', 'mail'],
  documento: ['documento', 'doc', 'cpf/cnpj', 'cpf cnpj', 'cpfcnpj', 'cnpj/cpf', 'nr documento'],
  cpf: ['cpf'],
  cnpj: ['cnpj'],
}

function scoreHeaderRow(row: any[]): number {
  const cells = row.map((c) => normKey(c))
  let score = 0
  const hasAny = (syns: string[]) => syns.some((s) => cells.includes(normKey(s)))

  if (hasAny(HEADER_SYNONYMS.name)) score += 3
  if (hasAny(HEADER_SYNONYMS.phone)) score += 2
  if (hasAny(HEADER_SYNONYMS.email)) score += 2
  if (hasAny(HEADER_SYNONYMS.documento) || hasAny(HEADER_SYNONYMS.cpf) || hasAny(HEADER_SYNONYMS.cnpj)) score += 3

  const filled = cells.filter(Boolean).length
  if (filled >= 4) score += 1
  if (filled >= 6) score += 1

  return score
}

function findHeaderRowIndex(matrix: any[][]): number {
  let bestIdx = -1
  let bestScore = 0
  const limit = Math.min(matrix.length, 80)

  for (let i = 0; i < limit; i++) {
    const row = matrix[i]
    if (!Array.isArray(row)) continue
    const score = scoreHeaderRow(row)
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }

  return bestScore >= 5 ? bestIdx : -1
}

function rowObjectFromHeader(header: any[], row: any[]) {
  const obj: any = {}
  for (let i = 0; i < header.length; i++) {
    const key = String(header[i] ?? '').trim()
    if (!key) continue
    obj[key] = row[i]
  }
  return obj
}

function isLikelyCpf(v: any) {
  const d = onlyDigits(v)
  return d.length === 11 && !/^0+$/.test(d)
}
function isLikelyCnpj(v: any) {
  const d = onlyDigits(v)
  return d.length === 14 && !/^0+$/.test(d)
}
function isLikelyPhone(v: any) {
  const d = onlyDigits(v)
  return d.length >= 10 && d.length <= 13
}
function isLikelyEmail(v: any) {
  const s = String(v ?? '').trim()
  return s.includes('@') && s.includes('.')
}
function isLikelyName(v: any) {
  const s = String(v ?? '').trim()
  if (!s) return false
  if (onlyDigits(s).length >= Math.max(6, s.length - 1)) return false
  return s.length >= 5
}

function buildRowFromArray(row: any[]): ImportRow {
  let name: string | null = null
  let email: string | null = null
  let phone: string | null = null
  let cpf: string | null = null
  let cnpj: string | null = null

  for (const cell of row) {
    if (!name && isLikelyName(cell)) name = String(cell).trim()
    if (!email && isLikelyEmail(cell)) email = String(cell).trim()
    if (!cpf && isLikelyCpf(cell)) cpf = onlyDigits(cell)
    if (!cnpj && isLikelyCnpj(cell)) cnpj = onlyDigits(cell)
    if (!phone && isLikelyPhone(cell)) phone = onlyDigits(cell)
  }

  const tipo: 'PF' | 'PJ' = cnpj ? 'PJ' : 'PF'

  return {
    name: name ?? '',
    phone: phone ?? null,
    email: email ?? null,
    tipo,
    cpf: cpf ?? null,
    cnpj: cnpj ?? null,
    razao_social: null,
    cep: null,
    rua: null,
    numero: null,
    complemento: null,
    bairro: null,
    cidade: null,
    uf: null,
    pais: 'Brasil',
  }
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

export default function ImportExcelDialog({
  userId,
  companyId,
  listId,
  trigger,
  importMode,
  onImported,
}: {
  userId: string
  companyId: string
  listId?: string | null
  trigger: React.ReactNode
  importMode: 'POOL' | 'PRIVATE'
  onImported?: () => void
}) {
  const router = useRouter()
  const fileRef = React.useRef<HTMLInputElement | null>(null)

  const [open, setOpen] = React.useState(false)
  const [rows, setRows] = React.useState<ImportRow[]>([])
  const [rowErrors, setRowErrors] = React.useState<Record<number, string[]>>({})
  const [rowWarns, setRowWarns] = React.useState<Record<number, string[]>>({})
  const [loading, setLoading] = React.useState(false)
  const [fileName, setFileName] = React.useState<string | null>(null)

  const [msg, setMsg] = React.useState<string | null>(null)
  const [msgType, setMsgType] = React.useState<'ok' | 'err' | null>(null)

  const [pipelines, setPipelines] = React.useState<Pipeline[]>([])
  const [selectedPipelineId, setSelectedPipelineId] = React.useState<string>('')
  const [stages, setStages] = React.useState<Stage[]>([])
  const [selectedStageId, setSelectedStageId] = React.useState<string>('')
  const selectedPipeline = React.useMemo(
    () => pipelines.find((p) => p.id === selectedPipelineId) ?? null,
    [pipelines, selectedPipelineId]
  )
  const totalValid = React.useMemo(() => {
    let ok = 0
    rows.forEach((_, i) => {
      const errs = rowErrors[i] ?? []
      if (errs.length === 0) ok++
    })
    return ok
  }, [rows, rowErrors])

  function reset() {
    setRows([])
    setRowErrors({})
    setRowWarns({})
    setFileName(null)
    setLoading(false)
    setMsg(null)
    setMsgType(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  React.useEffect(() => {
    if (!open) return
    ;(async () => {
      const { data, error } = await supabase
        .from('pipelines')
        .select('id,name,key,description,is_default,allow_create,is_active')
        .eq('company_id', companyId)
        .eq('is_active', true)

      if (error) return

      const list = (data ?? [])
        .filter((p: any) => p.allow_create !== false)
        .sort((a: any, b: any) => {
          const ad = a.is_default ? 0 : 1
          const bd = b.is_default ? 0 : 1
          if (ad !== bd) return ad - bd
          return String(a.name).localeCompare(String(b.name))
        }) as Pipeline[]

      setPipelines(list)
      const def = list.find((p) => (p as any).is_default) ?? list[0]
      if (def) setSelectedPipelineId(def.id)
    })()
  }, [open, companyId])

  React.useEffect(() => {
    if (!selectedPipelineId) {
      setStages([])
      setSelectedStageId('')
      return
    }

    ;(async () => {
      const { data, error } = await supabase
        .from('pipeline_stages')
        .select('id,name,key,position,is_active')
        .eq('pipeline_id', selectedPipelineId)
        .eq('is_active', true)
        .order('position', { ascending: true })

      if (error) return
      const list = (data ?? []) as any as Stage[]
      setStages(list)
      setSelectedStageId(list[0]?.id ?? '')
    })()
  }, [selectedPipelineId])

  async function detectCpfCnpjDuplicatesAgainstDb(mapped: ImportRow[]) {
    const cpfSet = new Set<string>()
    const cnpjSet = new Set<string>()

    mapped.forEach((r) => {
      const cpf = r.cpf ? onlyDigits(r.cpf) : null
      const cnpj = r.cnpj ? onlyDigits(r.cnpj) : null
      if (cpf && cpf.length === 11) cpfSet.add(cpf)
      if (cnpj && cnpj.length === 14) cnpjSet.add(cnpj)
    })

    const existingCpf = new Set<string>()
    const existingCnpj = new Set<string>()

    async function fetchIn(field: 'cpf' | 'cnpj', values: string[]) {
      const CHUNK = 500
      for (const slice of chunk(values, CHUNK)) {
        const { data, error } = await supabase
          .from('lead_profiles')
          .select('cpf,cnpj')
          .eq('company_id', companyId)
          .in(field, slice)

        if (error) throw error
        for (const row of (data ?? []) as any as ProfileKeyRow[]) {
          if (row.cpf) existingCpf.add(onlyDigits(row.cpf))
          if (row.cnpj) existingCnpj.add(onlyDigits(row.cnpj))
        }
      }
    }

    if (cpfSet.size) await fetchIn('cpf', Array.from(cpfSet))
    if (cnpjSet.size) await fetchIn('cnpj', Array.from(cnpjSet))

    const dupErrs: Record<number, string[]> = {}
    mapped.forEach((r, idx) => {
      const msgs: string[] = []
      const cpf = r.cpf ? onlyDigits(r.cpf) : null
      const cnpj = r.cnpj ? onlyDigits(r.cnpj) : null
      if (cpf && cpf.length === 11 && existingCpf.has(cpf)) msgs.push('Duplicado: CPF já existe.')
      if (cnpj && cnpj.length === 14 && existingCnpj.has(cnpj)) msgs.push('Duplicado: CNPJ já existe.')
      if (msgs.length) dupErrs[idx] = msgs
    })

    return dupErrs
  }

  // ✅ novo: duplicado DENTRO do arquivo
  function detectCpfCnpjDuplicatesInsideFile(mapped: ImportRow[]) {
    const seenCpf = new Map<string, number>() // cpf -> first idx
    const seenCnpj = new Map<string, number>()

    const dupErrs: Record<number, string[]> = {}

    mapped.forEach((r, idx) => {
      const s = sanitizeRow(r)
      const cpf = s.cpf
      const cnpj = s.cnpj

      if (cpf) {
        const first = seenCpf.get(cpf)
        if (first == null) seenCpf.set(cpf, idx)
        else {
          dupErrs[idx] = [...(dupErrs[idx] ?? []), `Duplicado no arquivo: CPF já apareceu na linha #${first + 1}.`]
        }
      }

      if (cnpj) {
        const first = seenCnpj.get(cnpj)
        if (first == null) seenCnpj.set(cnpj, idx)
        else {
          dupErrs[idx] = [...(dupErrs[idx] ?? []), `Duplicado no arquivo: CNPJ já apareceu na linha #${first + 1}.`]
        }
      }
    })

    return dupErrs
  }

  async function handleFile(file: File) {
    setLoading(true)
    setMsg(null)
    setMsgType(null)
    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array' })
      const sheetName = wb.SheetNames[0]
      const ws = wb.Sheets[sheetName]

      const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
      const headerIdx = findHeaderRowIndex(matrix)

      let mapped: ImportRow[] = []

      if (headerIdx >= 0) {
        const header = matrix[headerIdx]
        const dataRows = matrix.slice(headerIdx + 1)

        const objects = dataRows
          .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))
          .map((r) => rowObjectFromHeader(header, r))

        mapped = objects.map(mapRowToImportRow).filter((r) => r.name || r.phone || r.email)
      }

      if (mapped.length === 0) {
        const dataRows = matrix.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''))
        mapped = dataRows.map(buildRowFromArray).filter((r) => r.name || r.phone || r.email)
      }

      if (mapped.length === 0) {
        setRows([])
        setRowErrors({})
        setRowWarns({})
        setMsgType('err')
        setMsg('Não consegui identificar colunas/dados nessa planilha.')
        return
      }

      const errs: Record<number, string[]> = {}
      const warns: Record<number, string[]> = {}

      mapped.forEach((r, idx) => {
        const v = validateRowSoft(r)
        if (v.errs.length) errs[idx] = v.errs
        if (v.warns.length) warns[idx] = v.warns
      })

      // ✅ 1) duplicado no arquivo
      const dupInside = detectCpfCnpjDuplicatesInsideFile(mapped)
      for (const [k, v] of Object.entries(dupInside)) {
        const idx = Number(k)
        errs[idx] = [...(errs[idx] ?? []), ...v]
      }

      // ✅ 2) duplicado no banco
      const dupDb = await detectCpfCnpjDuplicatesAgainstDb(mapped)
      for (const [k, v] of Object.entries(dupDb)) {
        const idx = Number(k)
        errs[idx] = [...(errs[idx] ?? []), ...v]
      }

      setRows(mapped)
      setRowErrors(errs)
      setRowWarns(warns)

      setMsgType('ok')
      setMsg('Arquivo carregado. Linhas inválidas/duplicadas serão ignoradas.')
    } catch (e: any) {
      console.error('HANDLE FILE ERROR:', e)
      setMsgType('err')
      setMsg(e?.message ?? 'Erro ao ler planilha.')
    } finally {
      setLoading(false)
    }
  }

  async function importNow() {
    if (!rows.length) return

    if (!selectedPipelineId || !selectedStageId) {
      setMsgType('err')
      setMsg('Selecione Pipeline e Etapa antes de importar.')
      return
    }

    const validIndexes = rows.map((_, i) => i).filter((i) => (rowErrors[i] ?? []).length === 0)
    if (validIndexes.length === 0) {
      setMsgType('err')
      setMsg('Nenhuma linha válida para importar.')
      return
    }

    setLoading(true)
    setMsg(null)
    setMsgType(null)

    // Import robusto:
    // 1) insert leads em batch
    // 2) insert/upsert profiles em batch; se falhar, cai para linha-a-linha
    // 3) se profile falhar numa linha, apaga o lead daquela linha (evita órfão)
    try {
      const validRowsSanitized = validIndexes.map((i) => validateRowSoft(rows[i]).sanitized)
      const ownerIdToSave = importMode === 'POOL' ? null : userId

      const leadsPayload = validRowsSanitized.map((r) => ({
        owner_id: ownerIdToSave,
        created_by: userId,
        company_id: companyId,
        name: r.name.trim(),
        phone: r.phone ? onlyDigits(r.phone) : null,
        email: r.email ? r.email.trim() : null,
        current_pipeline_id: selectedPipelineId,
        current_stage_id: selectedStageId,
        status: 'novo',
      }))

      const { data: insertedLeads, error: leadErr } = await supabase.from('leads').insert(leadsPayload).select('id')
      if (leadErr) throw leadErr
      if (!insertedLeads?.length) throw new Error('Insert em leads não retornou IDs.')
// ✅ cria evento inicial de SLA/etapa (obrigatório para relatórios)
const stageEventsPayload = insertedLeads.map((x: any) => ({
  id: crypto.randomUUID(),
  lead_id: x.id,
  user_id: userId,          // obrigatório (NO)
  company_id: companyId,    // obrigatório (NO)
  from_status: null,
  to_status: 'novo',
  moved_at: new Date().toISOString(),
  seconds_in_from_status: null,
}))

const { error: stageEvErr } = await supabase.from('lead_stage_events').insert(stageEventsPayload)
if (stageEvErr) {
  console.warn('Erro ao criar lead_stage_events:', stageEvErr.message)
}
      const pairs = insertedLeads.map((x: any, idx: number) => ({
        leadId: x.id as string,
        row: validRowsSanitized[idx],
      }))

      const okLeadIds: string[] = []
      const badLeadIds: string[] = []

      // tenta em batches
      const BATCH = 500
      for (const part of chunk(pairs, BATCH)) {
        const profilesPayload = part.map(({ leadId, row }) => {
          const base: any = {
            lead_id: leadId,
            company_id: companyId,
            lead_type: row.tipo,
            email: row.email ? row.email.trim() : null,
            cep: row.cep ?? null,

            address_street: row.rua ?? null,
            address_number: row.numero ?? null,
            address_complement: row.complemento ?? null,
            address_neighborhood: row.bairro ?? null,
            address_city: row.cidade ?? null,
            address_state: row.uf ?? null,
            address_country: (row.pais ?? 'Brasil') as string,
          }

          if (row.tipo === 'PF') {
            base.cpf = row.cpf ? onlyDigits(row.cpf) : null
            base.cnpj = null
            base.razao_social = null
          } else {
            base.cnpj = row.cnpj ? onlyDigits(row.cnpj) : null
            base.razao_social = row.razao_social ?? null
            base.cpf = null
          }
          return base
        })

        const { error: profErr } = await supabase.from('lead_profiles').upsert(profilesPayload, { onConflict: 'lead_id' })

        if (!profErr) {
          okLeadIds.push(...part.map((p) => p.leadId))
          continue
        }

        // fallback: linha a linha (não trava tudo)
        for (const item of part) {
          const row = item.row
          const base: any = {
            lead_id: item.leadId,
            company_id: companyId,
            lead_type: row.tipo,
            email: row.email ? row.email.trim() : null,
            cep: row.cep ?? null,
            address_street: row.rua ?? null,
            address_number: row.numero ?? null,
            address_complement: row.complemento ?? null,
            address_neighborhood: row.bairro ?? null,
            address_city: row.cidade ?? null,
            address_state: row.uf ?? null,
            address_country: (row.pais ?? 'Brasil') as string,
          }

          if (row.tipo === 'PF') {
            base.cpf = row.cpf ? onlyDigits(row.cpf) : null
            base.cnpj = null
            base.razao_social = null
          } else {
            base.cnpj = row.cnpj ? onlyDigits(row.cnpj) : null
            base.razao_social = row.razao_social ?? null
            base.cpf = null
          }

          const { error } = await supabase.from('lead_profiles').upsert([base], { onConflict: 'lead_id' })
          if (error) badLeadIds.push(item.leadId)
          else okLeadIds.push(item.leadId)
        }
      }

      // remove leads que ficaram sem profile por falha (ex.: cpf duplicado)
      if (badLeadIds.length) {
        await supabase.from('leads').delete().in('id', badLeadIds)
      }

      if (listId && okLeadIds.length) {
        const membersPayload = okLeadIds.map((leadId) => ({
          company_id: companyId,
          list_id: listId,
          lead_id: leadId,
          metadata: {},
        }))
        await supabase.from('lead_list_members').upsert(membersPayload, { onConflict: 'list_id,lead_id' })
      }

      const skipped = rows.length - validIndexes.length
      setMsgType('ok')
      setMsg(
        `Importação concluída: ${okLeadIds.length} importados • ${skipped} ignorados • ${badLeadIds.length} rejeitados (CPF/CNPJ duplicado).`
      )

      setTimeout(() => {
        setOpen(false)
        reset()
        onImported?.()
        router.refresh()
      }, 800)
    } catch (e: any) {
      console.error('IMPORT ERROR RAW:', e)
      setMsgType('err')
      setMsg(e?.message ?? 'Erro ao importar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)}>{trigger}</span>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: 16,
          }}
          onClick={() => {
            setOpen(false)
            reset()
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 980,
              background: '#0f0f0f',
              border: '1px solid #333',
              borderRadius: 14,
              padding: 16,
              color: 'white',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Importar Leads via Excel</div>
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                  {importMode === 'POOL'
                    ? 'Modo Admin: leads entram no Pool (sem dono).'
                    : 'Modo Consultor: leads ficam privados na sua carteira.'}
                </div>
              </div>

              <button
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
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

            <div
              style={{
                marginTop: 12,
                border: '1px solid #333',
                borderRadius: 12,
                padding: 12,
                background: '#111',
              }}
            >
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ minWidth: 260, flex: 1 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Pipeline</div>
                  <select
                    value={selectedPipelineId}
                    onChange={(e) => setSelectedPipelineId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #333',
                      background: '#0f0f0f',
                      color: 'white',
                    }}
                  >
                    {pipelines.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>

                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>{selectedPipeline?.description ?? ''}</div>
                </div>

                <div style={{ minWidth: 260, flex: 1 }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 6 }}>Etapa inicial</div>
                  <select
                    value={selectedStageId}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #333',
                      background: '#0f0f0f',
                      color: 'white',
                    }}
                  >
                    {stages.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.position}. {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  setFileName(f.name)
                  handleFile(f)
                }}
              />

              <button
                onClick={() => fileRef.current?.click()}
                disabled={loading}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #333',
                  background: '#111',
                  color: 'white',
                  cursor: loading ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Procurar…
              </button>

              {!fileName ? (
                <span style={{ fontSize: 12, opacity: 0.75 }}>Nenhum arquivo selecionado</span>
              ) : (
                <span style={{ fontSize: 12, opacity: 0.8 }}>{fileName}</span>
              )}

              {loading ? <span style={{ fontSize: 12, opacity: 0.8 }}>Processando…</span> : null}
            </div>

            {msg ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 10,
                  borderRadius: 12,
                  border: '1px solid #333',
                  background: '#111',
                  color: msgType === 'err' ? '#fca5a5' : '#86efac',
                  fontSize: 13,
                }}
              >
                {msg}
              </div>
            ) : null}

            <div style={{ marginTop: 12, border: '1px solid #333', borderRadius: 12, padding: 12, background: '#111' }}>
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                Linhas: <b>{rows.length}</b> • Válidas: <b>{totalValid}</b> • Ignoradas: <b>{rows.length - totalValid}</b>
              </div>

              <div style={{ marginTop: 10, maxHeight: 260, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 6px', fontSize: 12 }}>
                  <thead style={{ opacity: 0.7 }}>
                    <tr>
                      <th style={{ textAlign: 'left' }}>#</th>
                      <th style={{ textAlign: 'left' }}>Nome</th>
                      <th style={{ textAlign: 'left' }}>Telefone</th>
                      <th style={{ textAlign: 'left' }}>E-mail</th>
                      <th style={{ textAlign: 'left' }}>Tipo</th>
                      <th style={{ textAlign: 'left' }}>Validação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => {
                      const errs = rowErrors[i] ?? []
                      const warns = rowWarns[i] ?? []
                      return (
                        <tr key={i} style={{ background: 'rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px 10px' }}>{i + 1}</td>
                          <td style={{ padding: '8px 10px' }}>{r.name}</td>
                          <td style={{ padding: '8px 10px' }}>{r.phone ?? '-'}</td>
                          <td style={{ padding: '8px 10px' }}>{r.email ?? '-'}</td>
                          <td style={{ padding: '8px 10px' }}>{r.tipo}</td>
                          <td style={{ padding: '8px 10px' }}>
                            {errs.length ? (
                              <span style={{ color: '#fca5a5' }}>IGNORADO: {errs.join(' | ')}</span>
                            ) : warns.length ? (
                              <span style={{ color: '#fde68a' }}>OK (aviso): {warns.slice(0, 2).join(' | ')}</span>
                            ) : (
                              <span style={{ color: '#86efac' }}>OK</span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>

                {rows.length > 50 ? (
                  <div style={{ marginTop: 8, opacity: 0.7, fontSize: 12 }}>
                    Mostrando 50 de {rows.length} linhas (preview).
                  </div>
                ) : null}
              </div>
            </div>

            <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => {
                  setOpen(false)
                  reset()
                }}
                disabled={loading}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #333',
                  background: 'transparent',
                  color: '#9aa',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>

              <button
                onClick={importNow}
                disabled={loading || rows.length === 0 || totalValid === 0 || !selectedPipelineId || !selectedStageId}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: '1px solid #333',
                  background:
                    loading || rows.length === 0 || totalValid === 0 || !selectedPipelineId || !selectedStageId
                      ? '#1a1a1a'
                      : '#111',
                  color:
                    loading || rows.length === 0 || totalValid === 0 || !selectedPipelineId || !selectedStageId
                      ? '#777'
                      : 'white',
                  cursor:
                    loading || rows.length === 0 || totalValid === 0 || !selectedPipelineId || !selectedStageId
                      ? 'not-allowed'
                      : 'pointer',
                }}
              >
                Importar válidos ({totalValid})
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}