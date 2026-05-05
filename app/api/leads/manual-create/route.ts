import { NextResponse } from 'next/server'
import { getAuthedSupabase } from '@/app/lib/supabase/server'
import { EVENT_SOURCES } from '@/app/config/analyticsBase'

type ManualCreateBody = {
  name?: unknown
  phone?: unknown
  email?: unknown
  cpf_cnpj?: unknown
  address_cep?: unknown
  address_street?: unknown
  address_number?: unknown
  address_complement?: unknown
  address_neighborhood?: unknown
  address_city?: unknown
  address_state?: unknown
  notes?: unknown
  group_id?: unknown
  owner_user_id?: unknown
  reactivate_deleted_lead?: unknown
}

type ActorProfile = {
  company_id: string | null
  role: string | null
  is_active: boolean | null
}

type LeadRow = {
  id: string
  company_id: string
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

type ConflictMatch = {
  lead: LeadRow
  matched_by: 'document' | 'phone' | 'email'
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

function normalizeCEP(value: unknown): string | null {
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

function normalizeDocumentInput(value: unknown): string | null {
  const digits = onlyDigits(value)

  if (!digits) return null

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

function buildLeadType(document: string | null): 'PF' | 'PJ' | null {
  if (!document) return null
  if (document.length === 11) return 'PF'
  if (document.length === 14) return 'PJ'
  return null
}

function isAdminRole(role: string | null): boolean {
  return role === 'admin'
}

function isDuplicateError(message: string): boolean {
  const msg = String(message || '').toLowerCase()
  return msg.includes('duplicate') || msg.includes('unique')
}

function buildConflictPayload(conflict: ConflictMatch) {
  return {
    lead_id: conflict.lead.id,
    name: conflict.lead.name,
    document: conflict.lead.cpf_cnpj,
    phone: conflict.lead.phone,
    email: conflict.lead.email,
    matched_by: conflict.matched_by,
    deleted_at: conflict.lead.deleted_at,
  }
}

function registerLead(
  lead: LeadRow,
  leadById: Map<string, LeadRow>,
  leadIdByDoc: Map<string, string>,
  leadIdByPhone: Map<string, string>,
  leadIdByEmail: Map<string, string>,
) {
  leadById.set(lead.id, lead)

  if (lead.cpf_cnpj) leadIdByDoc.set(lead.cpf_cnpj, lead.id)
  if (lead.phone) leadIdByPhone.set(lead.phone, lead.id)
  if (lead.email) leadIdByEmail.set(lead.email.toLowerCase(), lead.id)
}

function buildProfilePayload({
  companyId,
  leadId,
  document,
  email,
  cep,
  addressStreet,
  addressNumber,
  addressComplement,
  addressNeighborhood,
  addressCity,
  addressState,
}: {
  companyId: string
  leadId: string
  document: string | null
  email: string | null
  cep: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressNeighborhood: string | null
  addressCity: string | null
  addressState: string | null
}) {
  const payload: Record<string, unknown> = {
    lead_id: leadId,
    company_id: companyId,
    lead_type: buildLeadType(document),
    email,
    cep,
    address_street: addressStreet,
    address_number: addressNumber,
    address_complement: addressComplement,
    address_neighborhood: addressNeighborhood,
    address_city: addressCity,
    address_state: addressState,
    address_country: 'Brasil',
  }

  if (document?.length === 11) {
    payload.cpf = document
    payload.cnpj = null
  }

  if (document?.length === 14) {
    payload.cnpj = document
    payload.cpf = null
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
      delete payload[key]
    }
  })

  return payload
}

function buildLeadPatch({
  name,
  phone,
  email,
  document,
  cep,
  addressStreet,
  addressNumber,
  addressComplement,
  addressNeighborhood,
  addressCity,
  addressState,
  notes,
}: {
  name: string
  phone: string | null
  email: string | null
  document: string | null
  cep: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressNeighborhood: string | null
  addressCity: string | null
  addressState: string | null
  notes: string | null
}) {
  const payload: Record<string, unknown> = {
    name,
    phone,
    email,
    cpf_cnpj: document,
    address_cep: cep,
    address_street: addressStreet,
    address_number: addressNumber,
    address_complement: addressComplement,
    address_neighborhood: addressNeighborhood,
    address_city: addressCity,
    address_state: addressState,
    notes,
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
      delete payload[key]
    }
  })

  return payload
}

export async function POST(req: Request) {
  try {
    let supabase
    let user

    try {
      ;({ supabase, user } = await getAuthedSupabase())
    } catch {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = (await req.json().catch(() => ({}))) as ManualCreateBody

    const name = cleanText(body.name)
    const phone = normalizePhone(body.phone)
    const email = normalizeEmail(body.email)
    const document = normalizeDocumentInput(body.cpf_cnpj)
    const cep = normalizeCEP(body.address_cep)
    const addressStreet = cleanText(body.address_street)
    const addressNumber = cleanText(body.address_number)
    const addressComplement = cleanText(body.address_complement)
    const addressNeighborhood = cleanText(body.address_neighborhood)
    const addressCity = cleanText(body.address_city)
    const addressState = cleanText(body.address_state)
    const notes = cleanText(body.notes)
    const groupId = cleanText(body.group_id)
    const requestedOwnerUserId = cleanText(body.owner_user_id)
    const reactivateDeletedLead = body.reactivate_deleted_lead === true

    if (!name) {
      return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    }

    if (document) {
      if (![11, 14].includes(document.length) || !isValidDocument(document)) {
        return NextResponse.json(
          {
            error: document.length === 14 ? 'CNPJ inválido.' : 'CPF inválido.',
          },
          { status: 400 },
        )
      }
    }

    const { data: actorProfile, error: actorErr } = await supabase
      .from('profiles')
      .select('company_id, role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (actorErr) {
      return NextResponse.json({ error: actorErr.message }, { status: 400 })
    }

    const profile = actorProfile as ActorProfile | null

    if (!profile?.company_id) {
      return NextResponse.json({ error: 'company_id não encontrado.' }, { status: 400 })
    }

    if (profile.is_active === false) {
      return NextResponse.json({ error: 'Usuário inativo.' }, { status: 403 })
    }

    const companyId = profile.company_id
    const actorIsAdmin = isAdminRole(profile.role)

    let ownerUserId: string | null = actorIsAdmin ? null : user.id

    if (actorIsAdmin && requestedOwnerUserId) {
      const { data: ownerProfile, error: ownerErr } = await supabase
        .from('profiles')
        .select('id, company_id, is_active')
        .eq('id', requestedOwnerUserId)
        .eq('company_id', companyId)
        .maybeSingle()

      if (ownerErr) {
        return NextResponse.json({ error: ownerErr.message }, { status: 400 })
      }

      if (!ownerProfile?.id) {
        return NextResponse.json(
          { error: 'Vendedor inválido para esta empresa.' },
          { status: 400 },
        )
      }

      if (ownerProfile.is_active === false) {
        return NextResponse.json({ error: 'Vendedor inativo.' }, { status: 403 })
      }

      ownerUserId = requestedOwnerUserId
    }

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
        return NextResponse.json(
          { error: 'Grupo inválido para esta empresa.' },
          { status: 400 },
        )
      }
    }

    const leadById = new Map<string, LeadRow>()
    const leadIdByDoc = new Map<string, string>()
    const leadIdByPhone = new Map<string, string>()
    const leadIdByEmail = new Map<string, string>()

    const profileLeadIds = new Set<string>()

    if (document?.length === 11) {
      const { data, error } = await supabase
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .eq('cpf', document)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      for (const row of (data ?? []) as ProfileRow[]) {
        profileLeadIds.add(row.lead_id)
        if (row.cpf) leadIdByDoc.set(row.cpf, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    if (document?.length === 14) {
      const { data, error } = await supabase
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .eq('cnpj', document)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      for (const row of (data ?? []) as ProfileRow[]) {
        profileLeadIds.add(row.lead_id)
        if (row.cnpj) leadIdByDoc.set(row.cnpj, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    if (email) {
      const { data, error } = await supabase
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .eq('email', email)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      for (const row of (data ?? []) as ProfileRow[]) {
        profileLeadIds.add(row.lead_id)
        if (row.cpf) leadIdByDoc.set(row.cpf, row.lead_id)
        if (row.cnpj) leadIdByDoc.set(row.cnpj, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    if (profileLeadIds.size > 0) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .in('id', Array.from(profileLeadIds))

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLead(lead, leadById, leadIdByDoc, leadIdByPhone, leadIdByEmail)
      }
    }

    if (document) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .eq('cpf_cnpj', document)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLead(lead, leadById, leadIdByDoc, leadIdByPhone, leadIdByEmail)
      }
    }

    if (phone) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .eq('phone', phone)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLead(lead, leadById, leadIdByDoc, leadIdByPhone, leadIdByEmail)
      }
    }

    if (email) {
      const { data, error } = await supabase
        .from('leads')
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .eq('email', email)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLead(lead, leadById, leadIdByDoc, leadIdByPhone, leadIdByEmail)
      }
    }

    const candidates: ConflictMatch[] = []

    if (document) {
      const leadId = leadIdByDoc.get(document)
      const lead = leadId ? leadById.get(leadId) : null
      if (lead) candidates.push({ lead, matched_by: 'document' })
    }

    if (phone) {
      const leadId = leadIdByPhone.get(phone)
      const lead = leadId ? leadById.get(leadId) : null
      if (lead) candidates.push({ lead, matched_by: 'phone' })
    }

    if (email) {
      const leadId = leadIdByEmail.get(email)
      const lead = leadId ? leadById.get(leadId) : null
      if (lead) candidates.push({ lead, matched_by: 'email' })
    }

    const activeConflict = candidates.find((candidate) => !candidate.lead.deleted_at)

    if (activeConflict) {
      return NextResponse.json(
        {
          ok: false,
          code: 'active_lead_conflict',
          error: 'Lead já ativo no sistema. A criação manual foi bloqueada para evitar duplicidade.',
          conflict: buildConflictPayload(activeConflict),
        },
        { status: 409 },
      )
    }

    const deletedConflict = candidates.find((candidate) => candidate.lead.deleted_at)

    if (deletedConflict && !reactivateDeletedLead) {
      return NextResponse.json(
        {
          ok: false,
          code: 'deleted_lead_conflict',
          error: 'Existe um lead excluído com os mesmos dados. Confirme se deseja reativá-lo.',
          conflict: buildConflictPayload(deletedConflict),
        },
        { status: 409 },
      )
    }

    let leadId: string
    let action: 'created' | 'reactivated' = 'created'

    const leadPayload = buildLeadPatch({
      name,
      phone,
      email,
      document,
      cep,
      addressStreet,
      addressNumber,
      addressComplement,
      addressNeighborhood,
      addressCity,
      addressState,
      notes,
    })

    if (deletedConflict && reactivateDeletedLead) {
      action = 'reactivated'
      leadId = deletedConflict.lead.id

      const updatePayload = {
        ...leadPayload,
        deleted_at: null,
        deleted_by: null,
      }

      const { data: updatedLead, error: updateErr } = await supabase
        .from('leads')
        .update(updatePayload)
        .eq('id', leadId)
        .eq('company_id', companyId)
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .single()

      if (updateErr || !updatedLead?.id) {
        return NextResponse.json(
          { error: updateErr?.message || 'Falha ao reativar lead.' },
          { status: 400 },
        )
      }
    } else {
      const { data: createdLead, error: createErr } = await supabase
        .from('leads')
        .insert({
          ...leadPayload,
          company_id: companyId,
          created_by: user.id,
          entry_mode: 'manual',
        })
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .single()

      if (createErr || !createdLead?.id) {
        return NextResponse.json(
          { error: createErr?.message || 'Falha ao criar lead.' },
          { status: 400 },
        )
      }

      leadId = createdLead.id
    }

    const profilePayload = buildProfilePayload({
      companyId,
      leadId,
      document,
      email,
      cep,
      addressStreet,
      addressNumber,
      addressComplement,
      addressNeighborhood,
      addressCity,
      addressState,
    })

    const { error: profileErr } = await supabase
      .from('lead_profiles')
      .upsert(profilePayload, { onConflict: 'lead_id' })

    if (profileErr) {
      return NextResponse.json(
        { error: `Perfil do lead: ${profileErr.message}` },
        { status: 400 },
      )
    }

    const { data: existingCycles, error: cycleLookupErr } = await supabase
      .from('sales_cycles')
      .select('id, lead_id, current_group_id')
      .eq('company_id', companyId)
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (cycleLookupErr) {
      return NextResponse.json({ error: cycleLookupErr.message }, { status: 400 })
    }

    let cycle = ((existingCycles ?? [])[0] ?? null) as CycleRow | null

    if (!cycle) {
      const { data: createdCycle, error: cycleErr } = await supabase
        .from('sales_cycles')
        .insert({
          company_id: companyId,
          lead_id: leadId,
          owner_user_id: ownerUserId,
          status: 'novo',
          current_group_id: groupId || null,
          stage_entered_at: new Date().toISOString(),
        })
        .select('id, lead_id, current_group_id')
        .single()

      if (cycleErr || !createdCycle?.id) {
        return NextResponse.json(
          { error: cycleErr?.message || 'Falha ao criar ciclo comercial.' },
          { status: 400 },
        )
      }

      cycle = createdCycle as CycleRow

      const { error: cycleCreatedEventErr } = await supabase.from('cycle_events').insert({
        company_id: companyId,
        cycle_id: cycle.id,
        event_type: 'cycle_created',
        created_by: user.id,
        metadata: {
          lead_name: name,
          owner_user_id: ownerUserId,
          group_id: groupId || null,
          source: EVENT_SOURCES.cycle_create,
          entry_mode: 'manual',
        },
        occurred_at: new Date().toISOString(),
      })

      void cycleCreatedEventErr
    } else if (groupId && !cycle.current_group_id) {
      const { error: updateCycleErr } = await supabase
        .from('sales_cycles')
        .update({ current_group_id: groupId })
        .eq('id', cycle.id)
        .eq('company_id', companyId)

      if (updateCycleErr) {
        return NextResponse.json({ error: updateCycleErr.message }, { status: 400 })
      }

      cycle.current_group_id = groupId
    }

    if (groupId && cycle) {
      const { error: groupLinkErr } = await supabase.from('lead_group_cycles').insert({
        company_id: companyId,
        group_id: groupId,
        cycle_id: cycle.id,
        attached_by: user.id,
      })

      if (groupLinkErr && !isDuplicateError(groupLinkErr.message)) {
        return NextResponse.json(
          { error: `Grupo do lead: ${groupLinkErr.message}` },
          { status: 400 },
        )
      }

      const { error: groupEventErr } = await supabase.from('cycle_events').insert({
        company_id: companyId,
        cycle_id: cycle.id,
        event_type: 'group_attached',
        created_by: user.id,
        metadata: {
          group_id: groupId,
          source: EVENT_SOURCES.cycle_create,
          entry_mode: 'manual',
        },
        occurred_at: new Date().toISOString(),
      })

      void groupEventErr
    }

    if (action === 'reactivated' && cycle) {
      const { error: reactivationEventErr } = await supabase.from('cycle_events').insert({
        company_id: companyId,
        cycle_id: cycle.id,
        event_type: 'lead_reactivated_from_manual_create',
        created_by: user.id,
        metadata: {
          lead_id: leadId,
          source: 'manual_create',
          matched_by: deletedConflict?.matched_by ?? null,
          previous_deleted_at: deletedConflict?.lead.deleted_at ?? null,
        },
        occurred_at: new Date().toISOString(),
      })

      void reactivationEventErr
    }

    return NextResponse.json({
      ok: true,
      action,
      lead_id: leadId,
      cycle_id: cycle?.id ?? null,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao criar lead.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}