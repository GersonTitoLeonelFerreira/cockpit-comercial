import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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

function buildLeadPayload({
  companyId,
  userId,
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
  companyId: string
  userId: string
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
    company_id: companyId,
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
    created_by: userId,
    entry_mode: 'manual',
  }

  Object.keys(payload).forEach((key) => {
    if (payload[key] === null || payload[key] === undefined || payload[key] === '') {
      delete payload[key]
    }
  })

  return payload
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

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500 },
      )
    }

    let authContext: Awaited<ReturnType<typeof getAuthedSupabase>>

    try {
      authContext = await getAuthedSupabase()
    } catch {
      return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
    }

    const { supabase, user } = authContext

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

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

    if (!name) {
      return NextResponse.json({ ok: false, error: 'Nome é obrigatório.' }, { status: 400 })
    }

    if (document) {
      if (![11, 14].includes(document.length) || !isValidDocument(document)) {
        return NextResponse.json(
          {
            ok: false,
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
      return NextResponse.json({ ok: false, error: actorErr.message }, { status: 400 })
    }

    const profile = actorProfile as ActorProfile | null

    if (!profile?.company_id) {
      return NextResponse.json({ ok: false, error: 'company_id não encontrado.' }, { status: 400 })
    }

    if (profile.is_active === false) {
      return NextResponse.json({ ok: false, error: 'Usuário inativo.' }, { status: 403 })
    }

    const companyId = profile.company_id
    const actorIsAdmin = isAdminRole(profile.role)
    let ownerUserId: string | null = actorIsAdmin ? null : user.id

    if (actorIsAdmin && requestedOwnerUserId) {
      const { data: ownerProfile, error: ownerErr } = await admin
        .from('profiles')
        .select('id, company_id, is_active')
        .eq('id', requestedOwnerUserId)
        .eq('company_id', companyId)
        .maybeSingle()

      if (ownerErr) {
        return NextResponse.json({ ok: false, error: ownerErr.message }, { status: 400 })
      }

      if (!ownerProfile?.id) {
        return NextResponse.json(
          { ok: false, error: 'Vendedor inválido para esta empresa.' },
          { status: 400 },
        )
      }

      if (ownerProfile.is_active === false) {
        return NextResponse.json({ ok: false, error: 'Vendedor inativo.' }, { status: 403 })
      }

      ownerUserId = requestedOwnerUserId
    }

    if (groupId) {
      const { data: group, error: groupErr } = await admin
        .from('lead_groups')
        .select('id')
        .eq('company_id', companyId)
        .eq('id', groupId)
        .is('archived_at', null)
        .maybeSingle()

      if (groupErr) {
        return NextResponse.json({ ok: false, error: groupErr.message }, { status: 400 })
      }

      if (!group?.id) {
        return NextResponse.json(
          { ok: false, error: 'Grupo inválido para esta empresa.' },
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
      const { data, error } = await admin
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .eq('cpf', document)

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }

      for (const row of (data ?? []) as ProfileRow[]) {
        profileLeadIds.add(row.lead_id)
        if (row.cpf) leadIdByDoc.set(row.cpf, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    if (document?.length === 14) {
      const { data, error } = await admin
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .eq('cnpj', document)

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }

      for (const row of (data ?? []) as ProfileRow[]) {
        profileLeadIds.add(row.lead_id)
        if (row.cnpj) leadIdByDoc.set(row.cnpj, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    if (email) {
      const { data, error } = await admin
        .from('lead_profiles')
        .select('lead_id, cpf, cnpj, email')
        .eq('company_id', companyId)
        .eq('email', email)

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }

      for (const row of (data ?? []) as ProfileRow[]) {
        profileLeadIds.add(row.lead_id)
        if (row.cpf) leadIdByDoc.set(row.cpf, row.lead_id)
        if (row.cnpj) leadIdByDoc.set(row.cnpj, row.lead_id)
        if (row.email) leadIdByEmail.set(row.email.toLowerCase(), row.lead_id)
      }
    }

    if (profileLeadIds.size > 0) {
      const { data, error } = await admin
        .from('leads')
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .in('id', Array.from(profileLeadIds))

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLead(lead, leadById, leadIdByDoc, leadIdByPhone, leadIdByEmail)
      }
    }

    if (document) {
      const { data, error } = await admin
        .from('leads')
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .eq('cpf_cnpj', document)

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLead(lead, leadById, leadIdByDoc, leadIdByPhone, leadIdByEmail)
      }
    }

    if (phone) {
      const { data, error } = await admin
        .from('leads')
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .eq('phone', phone)

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
      }

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLead(lead, leadById, leadIdByDoc, leadIdByPhone, leadIdByEmail)
      }
    }

    if (email) {
      const { data, error } = await admin
        .from('leads')
        .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')
        .eq('company_id', companyId)
        .eq('email', email)

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
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

    if (deletedConflict) {
      return NextResponse.json(
        {
          ok: false,
          code: 'deleted_lead_conflict',
          error: actorIsAdmin
            ? 'Existe um lead excluído com os mesmos dados. Use o fluxo administrativo de reativação.'
            : 'Solicite a reativação desse lead ao administrador.',
          conflict: buildConflictPayload(deletedConflict),
        },
        { status: 409 },
      )
    }

    const leadPayload = buildLeadPayload({
      companyId,
      userId: user.id,
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

    const { data: createdLeads, error: createErr } = await admin
      .from('leads')
      .insert(leadPayload)
      .select('id, company_id, name, phone, email, cpf_cnpj, deleted_at, deleted_by')

    if (createErr) {
      return NextResponse.json({ ok: false, error: createErr.message }, { status: 400 })
    }

    const createdLead = createdLeads?.[0]

    if (!createdLead?.id) {
      return NextResponse.json({ ok: false, error: 'Falha ao criar lead.' }, { status: 400 })
    }

    const leadId = createdLead.id

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

    const { error: profileErr } = await admin
      .from('lead_profiles')
      .upsert(profilePayload, { onConflict: 'lead_id' })

    if (profileErr) {
      return NextResponse.json(
        { ok: false, error: `Perfil do lead: ${profileErr.message}` },
        { status: 400 },
      )
    }

    const { data: createdCycles, error: cycleErr } = await admin
      .from('sales_cycles')
      .insert({
        company_id: companyId,
        lead_id: leadId,
        owner_user_id: ownerUserId,
        status: 'novo',
        current_group_id: groupId || null,
        stage_entered_at: new Date().toISOString(),
      })
      .select('id, lead_id, current_group_id, owner_user_id, status')

    if (cycleErr) {
      return NextResponse.json({ ok: false, error: cycleErr.message }, { status: 400 })
    }

    const createdCycle = createdCycles?.[0]

    if (!createdCycle?.id) {
      return NextResponse.json({ ok: false, error: 'Falha ao criar ciclo comercial.' }, { status: 400 })
    }

    const cycleId = createdCycle.id as string

    const { error: cycleCreatedEventErr } = await admin.from('cycle_events').insert({
      company_id: companyId,
      cycle_id: cycleId,
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

    if (groupId) {
      const { error: groupLinkErr } = await admin.from('lead_group_cycles').insert({
        company_id: companyId,
        group_id: groupId,
        cycle_id: cycleId,
        attached_by: user.id,
      })

      if (groupLinkErr && !isDuplicateError(groupLinkErr.message)) {
        return NextResponse.json(
          { ok: false, error: `Grupo do lead: ${groupLinkErr.message}` },
          { status: 400 },
        )
      }

      const { error: groupEventErr } = await admin.from('cycle_events').insert({
        company_id: companyId,
        cycle_id: cycleId,
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

    return NextResponse.json({
      ok: true,
      action: 'created',
      lead_id: leadId,
      cycle_id: cycleId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro inesperado ao criar lead.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}