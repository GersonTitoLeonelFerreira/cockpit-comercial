import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getAuthedSupabase } from '@/app/lib/supabase/server'
import { EVENT_SOURCES } from '@/app/config/analyticsBase'

export const runtime = 'nodejs'
export const maxDuration = 300

type InputRow = {
  rowNumber?: number
  name?: string
  cpf_cnpj?: string | null
  phone?: string | null
  email?: string | null
  birth_date?: string | null
  address_cep?: string | null
  address_street?: string | null
  address_number?: string | null
  address_complement?: string | null
  address_neighborhood?: string | null
  address_city?: string | null
  address_state?: string | null
}

type NormalizedRow = {
  rowNumber: number
  name: string
  cpf_cnpj: string | null
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
}

type LeadRow = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  cpf_cnpj: string | null
  deleted_at: string | null
  deleted_by: string | null
}

type ProfileRow = {
  lead_id: string
  cpf: string | null
  cnpj: string | null
  email: string | null
}

type CycleRow = {
  id: string
  lead_id: string
  current_group_id: string | null
}

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

function onlyDigits(v: unknown) {
  return String(v ?? '').replace(/\D/g, '')
}

function cleanStr(v: unknown) {
  const s = String(v ?? '').trim()
  return s ? s : null
}

function normEmail(v: unknown) {
  const s = String(v ?? '').trim().toLowerCase()
  return s ? s : null
}

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

function isValidDocument(value: string | null) {
  if (!value) return false

  const digits = onlyDigits(value)

  if (digits.length === 11) return isValidCPF(digits)
  if (digits.length === 14) return isValidCNPJ(digits)

  return false
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

function isDuplicateError(message: string) {
  const msg = String(message || '').toLowerCase()
  return msg.includes('duplicate') || msg.includes('unique')
}

function buildLeadType(document: string | null) {
  if (!document) return null
  if (document.length === 14) return 'PJ'
  if (document.length === 11) return 'PF'
  return null
}

function normalizeRow(row: InputRow, index: number): NormalizedRow {
  return {
    rowNumber: Number(row?.rowNumber || index + 2),
    name: cleanStr(row?.name) || '',
    cpf_cnpj: normalizeDocumentInput(row?.cpf_cnpj) || null,
    phone: onlyDigits(row?.phone) || null,
    email: normEmail(row?.email),
    birth_date: cleanStr(row?.birth_date),
    address_cep: onlyDigits(row?.address_cep) || null,
    address_street: cleanStr(row?.address_street),
    address_number: cleanStr(row?.address_number),
    address_complement: cleanStr(row?.address_complement),
    address_neighborhood: cleanStr(row?.address_neighborhood),
    address_city: cleanStr(row?.address_city),
    address_state: cleanStr(row?.address_state),
  }
}

function buildLeadPatch(row: NormalizedRow) {
  const patch: Record<string, unknown> = {}

  if (row.name) patch.name = row.name
  if (row.phone) patch.phone = row.phone
  if (row.email) patch.email = row.email
  if (row.cpf_cnpj) patch.cpf_cnpj = row.cpf_cnpj
  if (row.address_cep) patch.address_cep = row.address_cep
  if (row.address_street) patch.address_street = row.address_street
  if (row.address_number) patch.address_number = row.address_number
  if (row.address_complement) patch.address_complement = row.address_complement
  if (row.address_neighborhood) patch.address_neighborhood = row.address_neighborhood
  if (row.address_city) patch.address_city = row.address_city
  if (row.address_state) patch.address_state = row.address_state

  return patch
}

function buildProfilePayload(companyId: string, leadId: string, row: NormalizedRow) {
  const leadType = buildLeadType(row.cpf_cnpj)

  const payload: Record<string, unknown> = {
    lead_id: leadId,
    company_id: companyId,
    lead_type: leadType,
    email: row.email,
    birth_date: row.birth_date,
    cep: row.address_cep,
    address_street: row.address_street,
    address_number: row.address_number,
    address_complement: row.address_complement,
    address_neighborhood: row.address_neighborhood,
    address_city: row.address_city,
    address_state: row.address_state,
    address_country: 'Brasil',
  }

  if (row.cpf_cnpj?.length === 11) {
    payload.cpf = row.cpf_cnpj
    payload.cnpj = null
  } else if (row.cpf_cnpj?.length === 14) {
    payload.cnpj = row.cpf_cnpj
    payload.cpf = null
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
      delete payload[key]
    }
  })

  return payload
}

function registerLeadMaps(
  lead: LeadRow,
  byId: Map<string, LeadRow>,
  byDoc: Map<string, string>,
  byEmail: Map<string, string>,
  byPhone: Map<string, string>,
) {
  byId.set(lead.id, lead)

  if (lead.cpf_cnpj) byDoc.set(lead.cpf_cnpj, lead.id)
  if (lead.email) byEmail.set(lead.email.toLowerCase(), lead.id)
  if (lead.phone) byPhone.set(lead.phone, lead.id)
}

function findDeletedConflicts(
  rows: NormalizedRow[],
  existingLeadById: Map<string, LeadRow>,
  leadIdByDoc: Map<string, string>,
) {
  const conflictsByRow = new Map<number, DeletedLeadConflict>()

  for (const row of rows) {
    if (!row.cpf_cnpj || !isValidDocument(row.cpf_cnpj)) continue

    const leadId = leadIdByDoc.get(row.cpf_cnpj) || null
    if (!leadId) continue

    const lead = existingLeadById.get(leadId)
    if (!lead?.deleted_at) continue

    conflictsByRow.set(row.rowNumber, {
      row: row.rowNumber,
      lead_id: lead.id,
      name: lead.name,
      document: lead.cpf_cnpj,
      phone: lead.phone,
      email: lead.email,
      matched_by: 'document',
      deleted_at: lead.deleted_at,
    })
  }

  return Array.from(conflictsByRow.values())
}

function findActiveConflicts(
  rows: NormalizedRow[],
  existingLeadById: Map<string, LeadRow>,
  leadIdByDoc: Map<string, string>,
) {
  const conflictsByRow = new Map<number, ActiveLeadConflict>()

  for (const row of rows) {
    if (!row.cpf_cnpj || !isValidDocument(row.cpf_cnpj)) continue

    const leadId = leadIdByDoc.get(row.cpf_cnpj) || null
    if (!leadId) continue

    const lead = existingLeadById.get(leadId)
    if (!lead || lead.deleted_at) continue

    conflictsByRow.set(row.rowNumber, {
      row: row.rowNumber,
      lead_id: lead.id,
      name: lead.name,
      document: lead.cpf_cnpj,
      phone: lead.phone,
      email: lead.email,
      matched_by: 'document',
    })
  }

  return Array.from(conflictsByRow.values())
}

export async function POST(req: Request) {
  try {
    const authedContext = await getAuthedSupabase().catch(() => null)

    if (!authedContext) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { supabase: authSupabase, user } = authedContext

    const body = await req.json().catch(() => ({} as Record<string, unknown>))
    const rowsInput: InputRow[] = Array.isArray(body?.rows) ? body.rows : []
    const groupId = cleanStr(body?.group_id)
    const reactivateDeletedLeads = body?.reactivate_deleted_leads === true
    const checkDeletedConflictsOnly = body?.check_deleted_conflicts_only === true

    if (rowsInput.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha recebida.' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json({ error: 'Empresa ativa não selecionada.' }, { status: 400 })
    }

    const { data: actorProfile, error: actorErr } = await authSupabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', user.id)
      .maybeSingle()

    if (actorErr) {
      return NextResponse.json({ error: actorErr.message }, { status: 400 })
    }

    if (!actorProfile?.id) {
      return NextResponse.json(
        { error: 'Perfil do usuário logado não encontrado.' },
        { status: 403 },
      )
    }

    if (actorProfile.is_active_global === false) {
      return NextResponse.json({ error: 'Usuário globalmente inativo.' }, { status: 403 })
    }

    const { data: actorMembership, error: actorMembershipErr } = await authSupabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (actorMembershipErr) {
      return NextResponse.json({ error: actorMembershipErr.message }, { status: 400 })
    }

    if (!actorMembership?.company_id) {
      return NextResponse.json(
        { error: 'Usuário sem vínculo ativo com a empresa.' },
        { status: 403 },
      )
    }

    const companyId = String(actorMembership.company_id)
    const defaultOwnerUserId = actorMembership.role === 'admin' ? null : user.id

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          error:
            'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500 },
      )
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    if (groupId) {
      const { data: group, error: groupErr } = await supabase
        .from('lead_groups')
        .select('id')
        .eq('company_id', companyId)
        .eq('id', groupId)
        .is('archived_at', null)
        .maybeSingle()

      if (groupErr) {
        return NextResponse.json({ error: groupErr.message }, { status: 400 })
      }

      if (!group?.id) {
        return NextResponse.json({ error: 'Grupo inválido para esta empresa.' }, { status: 400 })
      }
    }

    const rows = rowsInput.map(normalizeRow)

    const documents = Array.from(new Set(rows.map((r) => r.cpf_cnpj).filter((v): v is string => !!v)))
    const emails = Array.from(new Set(rows.map((r) => r.email).filter((v): v is string => !!v)))
    const phones = Array.from(new Set(rows.map((r) => r.phone).filter((v): v is string => !!v)))

    const cpfs = documents.filter((d) => d.length === 11)
    const cnpjs = documents.filter((d) => d.length === 14)

    const existingLeadById = new Map<string, LeadRow>()
    const leadIdByDoc = new Map<string, string>()
    const leadIdByEmail = new Map<string, string>()
    const leadIdByPhone = new Map<string, string>()
    const cycleByLeadId = new Map<string, CycleRow>()

    if (cpfs.length > 0) {
      const { data } = await supabase
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .in('cpf', cpfs)

      for (const row of (data ?? []) as ProfileRow[]) {
        if (row.cpf) leadIdByDoc.set(row.cpf, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    if (cnpjs.length > 0) {
      const { data } = await supabase
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .in('cnpj', cnpjs)

      for (const row of (data ?? []) as ProfileRow[]) {
        if (row.cnpj) leadIdByDoc.set(row.cnpj, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    if (emails.length > 0) {
      const { data } = await supabase
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .in('email', emails)

      for (const row of (data ?? []) as ProfileRow[]) {
        if (row.cpf) leadIdByDoc.set(row.cpf, row.lead_id)
        if (row.cnpj) leadIdByDoc.set(row.cnpj, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    const leadIdsFromProfiles = Array.from(
      new Set([...Array.from(leadIdByDoc.values()), ...Array.from(leadIdByEmail.values())]),
    )

    if (leadIdsFromProfiles.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .in('id', leadIdsFromProfiles)

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLeadMaps(lead, existingLeadById, leadIdByDoc, leadIdByEmail, leadIdByPhone)
      }
    }

    if (phones.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .in('phone', phones)

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLeadMaps(lead, existingLeadById, leadIdByDoc, leadIdByEmail, leadIdByPhone)
      }
    }

    if (emails.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .in('email', emails)

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLeadMaps(lead, existingLeadById, leadIdByDoc, leadIdByEmail, leadIdByPhone)
      }
    }

    if (documents.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .in('cpf_cnpj', documents)

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLeadMaps(lead, existingLeadById, leadIdByDoc, leadIdByEmail, leadIdByPhone)
      }
    }

    const deletedConflicts = findDeletedConflicts(
      rows,
      existingLeadById,
      leadIdByDoc,
    )

    const activeConflicts = findActiveConflicts(
      rows,
      existingLeadById,
      leadIdByDoc,
    )

    if (checkDeletedConflictsOnly) {
      return NextResponse.json({
        ok: true,
        deleted_conflicts: deletedConflicts,
        active_conflicts: activeConflicts,
      })
    }

    if (deletedConflicts.length > 0 && !reactivateDeletedLeads) {
      return NextResponse.json(
        {
          ok: false,
          code: 'deleted_lead_conflict',
          error: 'Existem leads excluídos nesta importação. Confirme se deseja reativá-los.',
          deleted_conflicts: deletedConflicts,
        },
        { status: 409 },
      )
    }

    const allKnownLeadIds = Array.from(existingLeadById.keys())

    if (allKnownLeadIds.length > 0) {
      const { data } = await supabase
        .from('sales_cycles')
        .select('id, lead_id, current_group_id')
        .eq('company_id', companyId)
        .in('lead_id', allKnownLeadIds)
        .order('created_at', { ascending: false })

      for (const cycle of (data ?? []) as CycleRow[]) {
        if (!cycleByLeadId.has(cycle.lead_id)) {
          cycleByLeadId.set(cycle.lead_id, cycle)
        }
      }
    }

    const errors: Array<{ row: number; error: string }> = []
    const seenDocs = new Set<string>()

    let created = 0
    let updated = 0
    let reactivated = 0
    let createdCycles = 0

    const cycleEventsToInsert: Array<{
      company_id: string
      cycle_id: string
      event_type: string
      created_by: string
      metadata: Record<string, unknown>
      occurred_at: string
    }> = []

    const groupLinksToInsert: Array<{
      company_id: string
      group_id: string
      cycle_id: string
      attached_by: string
    }> = []

    const cyclesToInsert: Array<{
      rowNumber: number
      leadName: string
      leadId: string
      ownerUserId: string | null
      currentGroupId: string | null
      stageEnteredAt: string
    }> = []

    const profilesToUpsert: Array<Record<string, unknown>> = []

    type ImportWorkRow = {
      row: NormalizedRow
      leadId: string | null
      currentLead: LeadRow | null
      isNewLead: boolean
    }

    const workRows: ImportWorkRow[] = []

    for (const row of rows) {
      if (!row.name) {
        errors.push({ row: row.rowNumber, error: 'Nome é obrigatório.' })
        continue
      }

      if (!row.cpf_cnpj || ![11, 14].includes(row.cpf_cnpj.length) || !isValidDocument(row.cpf_cnpj)) {
        errors.push({ row: row.rowNumber, error: 'CPF/CNPJ inválido.' })
        continue
      }


      if (seenDocs.has(row.cpf_cnpj)) {
        errors.push({ row: row.rowNumber, error: 'CPF/CNPJ duplicado no payload.' })
        continue
      }

      seenDocs.add(row.cpf_cnpj)

      const leadIdFromDoc = leadIdByDoc.get(row.cpf_cnpj) || null

      const currentLead = leadIdFromDoc ? existingLeadById.get(leadIdFromDoc) || null : null

      if (leadIdFromDoc && currentLead && !currentLead.deleted_at) {
        errors.push({
          row: row.rowNumber,
          error: `Lead já ativo no sistema (${currentLead.name || 'Sem nome'} - ${currentLead.id.slice(0, 8)}).`,
        })
        continue
      }

      workRows.push({
        row,
        leadId: leadIdFromDoc,
        currentLead,
        isNewLead: !leadIdFromDoc,
      })
    }

    const newLeadWorkRows = workRows.filter((workRow) => workRow.isNewLead)

    if (newLeadWorkRows.length > 0) {
      const newLeadPayloads = newLeadWorkRows.map(({ row }) => ({
        company_id: companyId,
        name: row.name,
        phone: row.phone,
        email: row.email,
        cpf_cnpj: row.cpf_cnpj,
        address_cep: row.address_cep,
        address_street: row.address_street,
        address_number: row.address_number,
        address_complement: row.address_complement,
        address_neighborhood: row.address_neighborhood,
        address_city: row.address_city,
        address_state: row.address_state,
        created_by: user.id,
        entry_mode: 'import_excel',
      }))

      const { data: insertedLeads, error: insertLeadsError } = await supabase
        .from('leads')
        .insert(newLeadPayloads)
        .select('id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')

      if (insertLeadsError) {
        for (const workRow of newLeadWorkRows) {
          errors.push({
            row: workRow.row.rowNumber,
            error: insertLeadsError.message || 'Falha ao criar lead.',
          })
        }
      } else {
        const insertedLeadByDocument = new Map<string, LeadRow>()

        for (const lead of (insertedLeads ?? []) as LeadRow[]) {
          if (lead.cpf_cnpj) {
            insertedLeadByDocument.set(lead.cpf_cnpj, lead)
          }

          registerLeadMaps(
            lead,
            existingLeadById,
            leadIdByDoc,
            leadIdByEmail,
            leadIdByPhone,
          )
        }

        for (const workRow of newLeadWorkRows) {
          const insertedLead = workRow.row.cpf_cnpj
            ? insertedLeadByDocument.get(workRow.row.cpf_cnpj) || null
            : null

          if (!insertedLead?.id) {
            errors.push({
              row: workRow.row.rowNumber,
              error: 'Lead criado em lote não retornou identificador.',
            })
            continue
          }

          workRow.leadId = insertedLead.id
          workRow.currentLead = insertedLead
          created++
        }
      }
    }

    for (const workRow of workRows) {
      const { row } = workRow
      const leadId = workRow.leadId

      if (!leadId) {
        continue
      }

      try {
        if (!workRow.isNewLead) {
          const currentLead = workRow.currentLead
          const patch = buildLeadPatch(row)

          if (currentLead?.deleted_at) {
            if (!reactivateDeletedLeads) {
              errors.push({
                row: row.rowNumber,
                error: `Lead excluído encontrado (${currentLead.id.slice(0, 8)}). Reativação não confirmada.`,
              })
              continue
            }

            patch.deleted_at = null
            patch.deleted_by = null
          }

          if (Object.keys(patch).length > 0) {
            const { data: updatedLead, error: updateErr } = await supabase
              .from('leads')
              .update(patch)
              .eq('id', leadId)
              .eq('company_id', companyId)
              .select('id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
              .single()

            if (updateErr) {
              errors.push({ row: row.rowNumber, error: updateErr.message })
              continue
            }

            if (updatedLead) {
              workRow.currentLead = updatedLead as LeadRow
              existingLeadById.set(leadId, updatedLead as LeadRow)
            }
          }

          if (currentLead?.deleted_at && reactivateDeletedLeads) {
            reactivated++

            const existingCycleId = cycleByLeadId.get(leadId)?.id ?? null

            if (existingCycleId) {
              cycleEventsToInsert.push({
                company_id: companyId,
                cycle_id: existingCycleId,
                event_type: 'lead_reactivated_from_import',
                created_by: user.id,
                metadata: {
                  lead_id: leadId,
                  source: 'import_excel',
                  previous_deleted_at: currentLead.deleted_at,
                },
                occurred_at: new Date().toISOString(),
              })
            }
          } else {
            updated++
          }

          const refreshedLead = existingLeadById.get(leadId) || currentLead

          registerLeadMaps(
            {
              id: leadId,
              name: row.name || refreshedLead?.name || null,
              phone: row.phone || refreshedLead?.phone || null,
              email: row.email || refreshedLead?.email || null,
              cpf_cnpj: row.cpf_cnpj || refreshedLead?.cpf_cnpj || null,
              deleted_at: refreshedLead?.deleted_at ?? null,
              deleted_by: refreshedLead?.deleted_by ?? null,
            },
            existingLeadById,
            leadIdByDoc,
            leadIdByEmail,
            leadIdByPhone,
          )
        }

        const resolvedLeadId = leadId
        const profilePayload = buildProfilePayload(companyId, resolvedLeadId, row)
        profilesToUpsert.push(profilePayload)

        const cycle = cycleByLeadId.get(resolvedLeadId) || null

        if (!cycle) {
          cyclesToInsert.push({
            rowNumber: row.rowNumber,
            leadName: row.name,
            leadId: resolvedLeadId,
            ownerUserId: defaultOwnerUserId,
            currentGroupId: groupId || null,
            stageEnteredAt: new Date().toISOString(),
          })
        } else if (groupId && !cycle.current_group_id) {
          const { error: cycleUpdateErr } = await supabase
            .from('sales_cycles')
            .update({ current_group_id: groupId })
            .eq('id', cycle.id)
            .eq('company_id', companyId)

          if (!cycleUpdateErr) {
            cycle.current_group_id = groupId
            cycleByLeadId.set(resolvedLeadId, cycle)

            groupLinksToInsert.push({
              company_id: companyId,
              group_id: groupId,
              cycle_id: cycle.id,
              attached_by: user.id,
            })

            cycleEventsToInsert.push({
              company_id: companyId,
              cycle_id: cycle.id,
              event_type: 'group_attached',
              created_by: user.id,
              metadata: { group_id: groupId },
              occurred_at: new Date().toISOString(),
            })
          }
        }
      } catch (e: unknown) {
        errors.push({
          row: row.rowNumber,
          error: e instanceof Error && e.message ? e.message : 'Erro inesperado ao processar linha.',
        })
      }
    }

    if (cyclesToInsert.length > 0) {
      const cycleLeadIds = Array.from(
        new Set(cyclesToInsert.map((cycleToInsert) => cycleToInsert.leadId)),
      )

      const { data: existingCyclesBeforeInsert, error: existingCyclesBeforeInsertError } =
        await supabase
          .from('sales_cycles')
          .select('id, lead_id, current_group_id')
          .eq('company_id', companyId)
          .in('lead_id', cycleLeadIds)

      if (existingCyclesBeforeInsertError) {
        console.error(
          'Erro ao validar ciclos existentes antes da criação em lote:',
          existingCyclesBeforeInsertError,
        )

        for (const cycleToInsert of cyclesToInsert) {
          errors.push({
            row: cycleToInsert.rowNumber,
            error: existingCyclesBeforeInsertError.message || 'Falha ao validar ciclo existente.',
          })
        }
      } else {
        const existingCycleByLeadIdBeforeInsert = new Map<string, CycleRow>()

        for (const cycle of (existingCyclesBeforeInsert ?? []) as CycleRow[]) {
          existingCycleByLeadIdBeforeInsert.set(cycle.lead_id, cycle)
          cycleByLeadId.set(cycle.lead_id, cycle)
        }

        const existingCycleGroupUpdateById = new Map<
          string,
          {
            cycle: CycleRow
            currentGroupId: string
          }
        >()

        const cyclesSafeToInsert = cyclesToInsert.filter((cycleToInsert) => {
          const existingCycle = existingCycleByLeadIdBeforeInsert.get(cycleToInsert.leadId) || null

          if (!existingCycle) return true

          if (cycleToInsert.currentGroupId && !existingCycle.current_group_id) {
            existingCycleGroupUpdateById.set(existingCycle.id, {
              cycle: existingCycle,
              currentGroupId: cycleToInsert.currentGroupId,
            })
          }

          return false
        })

        const existingCycleGroupUpdates = Array.from(existingCycleGroupUpdateById.values())

        if (existingCycleGroupUpdates.length > 0) {
          const groupIdToApply = existingCycleGroupUpdates[0]?.currentGroupId ?? null

          if (groupIdToApply) {
            const { error: existingCycleGroupUpdateError } = await supabase
              .from('sales_cycles')
              .update({ current_group_id: groupIdToApply })
              .eq('company_id', companyId)
              .in(
                'id',
                existingCycleGroupUpdates.map((item) => item.cycle.id),
              )

            if (existingCycleGroupUpdateError) {
              console.error(
                'Erro ao atualizar grupo de ciclos existentes na importação:',
                existingCycleGroupUpdateError,
              )
            } else {
              for (const item of existingCycleGroupUpdates) {
                item.cycle.current_group_id = item.currentGroupId
                cycleByLeadId.set(item.cycle.lead_id, item.cycle)

                groupLinksToInsert.push({
                  company_id: companyId,
                  group_id: item.currentGroupId,
                  cycle_id: item.cycle.id,
                  attached_by: user.id,
                })

                cycleEventsToInsert.push({
                  company_id: companyId,
                  cycle_id: item.cycle.id,
                  event_type: 'group_attached',
                  created_by: user.id,
                  metadata: { group_id: item.currentGroupId },
                  occurred_at: new Date().toISOString(),
                })
              }
            }
          }
        }

        if (cyclesSafeToInsert.length > 0) {
          const { data: insertedCycles, error: cyclesInsertError } = await supabase
            .from('sales_cycles')
            .insert(
              cyclesSafeToInsert.map((cycleToInsert) => ({
                company_id: companyId,
                lead_id: cycleToInsert.leadId,
                owner_user_id: cycleToInsert.ownerUserId,
                status: 'novo',
                current_group_id: cycleToInsert.currentGroupId,
                stage_entered_at: cycleToInsert.stageEnteredAt,
              })),
            )
            .select('id, lead_id, current_group_id')

          if (cyclesInsertError) {
            console.error('Erro ao criar ciclos da importação em lote:', cyclesInsertError)

            for (const cycleToInsert of cyclesSafeToInsert) {
              errors.push({
                row: cycleToInsert.rowNumber,
                error: cyclesInsertError.message || 'Falha ao criar ciclo.',
              })
            }
          } else {
            const insertedCycleByLeadId = new Map<string, CycleRow>()

            for (const cycle of (insertedCycles ?? []) as CycleRow[]) {
              insertedCycleByLeadId.set(cycle.lead_id, cycle)
              cycleByLeadId.set(cycle.lead_id, cycle)
            }

            for (const cycleToInsert of cyclesSafeToInsert) {
              const cycle = insertedCycleByLeadId.get(cycleToInsert.leadId) || null

              if (!cycle?.id) {
                errors.push({
                  row: cycleToInsert.rowNumber,
                  error: 'Ciclo criado em lote não retornou identificador.',
                })
                continue
              }

              createdCycles++

              cycleEventsToInsert.push({
                company_id: companyId,
                cycle_id: cycle.id,
                event_type: 'cycle_created',
                created_by: user.id,
                metadata: {
                  lead_name: cycleToInsert.leadName,
                  owner_user_id: cycleToInsert.ownerUserId,
                  group_id: cycleToInsert.currentGroupId,
                  source: EVENT_SOURCES.cycle_create,
                },
                occurred_at: new Date().toISOString(),
              })

              if (cycleToInsert.currentGroupId) {
                groupLinksToInsert.push({
                  company_id: companyId,
                  group_id: cycleToInsert.currentGroupId,
                  cycle_id: cycle.id,
                  attached_by: user.id,
                })

                cycleEventsToInsert.push({
                  company_id: companyId,
                  cycle_id: cycle.id,
                  event_type: 'group_attached',
                  created_by: user.id,
                  metadata: { group_id: cycleToInsert.currentGroupId },
                  occurred_at: new Date().toISOString(),
                })
              }
            }
          }
        }
      }
    }

    if (profilesToUpsert.length > 0) {
      const { error: profilesError } = await supabase
        .from('lead_profiles')
        .upsert(profilesToUpsert, { onConflict: 'lead_id' })

      if (profilesError) {
        console.error('Erro ao upsert profiles da importação em lote:', profilesError)

        errors.push({
          row: 0,
          error: `Perfis: ${profilesError.message}`,
        })
      }
    }

    if (groupLinksToInsert.length > 0) {
      const { error: groupLinksError } = await supabase
        .from('lead_group_cycles')
        .insert(groupLinksToInsert)

      if (groupLinksError && !isDuplicateError(groupLinksError.message)) {
        console.error('Erro ao vincular grupos da importação em lote:', groupLinksError)
      }
    }

    if (cycleEventsToInsert.length > 0) {
      const { error: cycleEventsError } = await supabase
        .from('cycle_events')
        .insert(cycleEventsToInsert)

      if (cycleEventsError) {
        console.error('Erro ao registrar eventos da importação em lote:', cycleEventsError)
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      reactivated,
      created_cycles: createdCycles,
      events_created: cycleEventsToInsert.length,
      group_links_created: groupLinksToInsert.length,
      profiles_upserted: profilesToUpsert.length,
      cycles_inserted_in_batch: cyclesToInsert.length,
      errors,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error && e.message ? e.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}