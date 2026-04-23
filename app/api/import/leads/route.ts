import { NextResponse } from 'next/server'
import { getAuthedSupabase } from '@/app/lib/supabase/server'
import { EVENT_SOURCES } from '@/app/config/analyticsBase'

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

function onlyDigits(v: any) {
  return String(v ?? '').replace(/\D/g, '')
}

function cleanStr(v: any) {
  const s = String(v ?? '').trim()
  return s ? s : null
}

function normEmail(v: any) {
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
    cpf_cnpj: onlyDigits(row?.cpf_cnpj) || null,
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
  const patch: Record<string, any> = {}

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

  const payload: Record<string, any> = {
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

export async function POST(req: Request) {
  try {
    let supabase, user
    try {
      ;({ supabase, user } = await getAuthedSupabase())
    } catch {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({} as any))
    const rowsInput: InputRow[] = Array.isArray(body?.rows) ? body.rows : []
    const groupId = cleanStr(body?.group_id)

    if (rowsInput.length === 0) {
      return NextResponse.json({ error: 'Nenhuma linha recebida.' }, { status: 400 })
    }

    const { data: actorProfile, error: actorErr } = await supabase
      .from('profiles')
      .select('company_id, role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    if (actorErr) {
      return NextResponse.json({ error: actorErr.message }, { status: 400 })
    }

    if (!actorProfile?.company_id) {
      return NextResponse.json({ error: 'company_id não encontrado.' }, { status: 400 })
    }

    if (actorProfile.is_active === false) {
      return NextResponse.json({ error: 'Usuário inativo.' }, { status: 403 })
    }

    const companyId = String(actorProfile.company_id)
    const defaultOwnerUserId = actorProfile.role === 'admin' ? null : user.id

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
        .select('id, name, phone, email, cpf_cnpj')
        .eq('company_id', companyId)
        .in('id', leadIdsFromProfiles)

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLeadMaps(lead, existingLeadById, leadIdByDoc, leadIdByEmail, leadIdByPhone)
      }
    }

    if (phones.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, cpf_cnpj')
        .eq('company_id', companyId)
        .in('phone', phones)

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLeadMaps(lead, existingLeadById, leadIdByDoc, leadIdByEmail, leadIdByPhone)
      }
    }

    if (emails.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, cpf_cnpj')
        .eq('company_id', companyId)
        .in('email', emails)

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLeadMaps(lead, existingLeadById, leadIdByDoc, leadIdByEmail, leadIdByPhone)
      }
    }

    if (documents.length > 0) {
      const { data } = await supabase
        .from('leads')
        .select('id, name, phone, email, cpf_cnpj')
        .eq('company_id', companyId)
        .in('cpf_cnpj', documents)

      for (const lead of (data ?? []) as LeadRow[]) {
        registerLeadMaps(lead, existingLeadById, leadIdByDoc, leadIdByEmail, leadIdByPhone)
      }
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
    const seenEmails = new Set<string>()
    const seenPhones = new Set<string>()

    let created = 0
    let updated = 0
    let createdCycles = 0

    for (const row of rows) {
      if (!row.name) {
        errors.push({ row: row.rowNumber, error: 'Nome é obrigatório.' })
        continue
      }

      if (!row.cpf_cnpj || ![11, 14].includes(row.cpf_cnpj.length) || !isValidDocument(row.cpf_cnpj)) {
        errors.push({ row: row.rowNumber, error: 'CPF/CNPJ inválido.' })
        continue
      }

      if (row.email && seenEmails.has(row.email)) {
        errors.push({ row: row.rowNumber, error: 'E-mail duplicado no payload.' })
        continue
      }

      if (row.phone && seenPhones.has(row.phone)) {
        errors.push({ row: row.rowNumber, error: 'Telefone duplicado no payload.' })
        continue
      }

      if (seenDocs.has(row.cpf_cnpj)) {
        errors.push({ row: row.rowNumber, error: 'CPF/CNPJ duplicado no payload.' })
        continue
      }

      seenDocs.add(row.cpf_cnpj)
      if (row.email) seenEmails.add(row.email)
      if (row.phone) seenPhones.add(row.phone)

      try {
        const leadIdFromDoc = leadIdByDoc.get(row.cpf_cnpj) || null
        const leadIdFromEmail = row.email ? leadIdByEmail.get(row.email) || null : null
        const leadIdFromPhone = row.phone ? leadIdByPhone.get(row.phone) || null : null

        const emailConflictLeadId =
          leadIdFromEmail && leadIdFromEmail !== leadIdFromDoc ? leadIdFromEmail : null
        const phoneConflictLeadId =
          leadIdFromPhone && leadIdFromPhone !== leadIdFromDoc ? leadIdFromPhone : null

        const emailConflictLead = emailConflictLeadId
          ? existingLeadById.get(emailConflictLeadId) || null
          : null

        const phoneConflictLead = phoneConflictLeadId
          ? existingLeadById.get(phoneConflictLeadId) || null
          : null

        if (emailConflictLead) {
          errors.push({
            row: row.rowNumber,
            error: `E-mail já pertence ao lead ${emailConflictLead.name || 'Sem nome'} (${emailConflictLead.id.slice(0, 8)}).`,
          })
          continue
        }

        if (phoneConflictLead) {
          errors.push({
            row: row.rowNumber,
            error: `Telefone já pertence ao lead ${phoneConflictLead.name || 'Sem nome'} (${phoneConflictLead.id.slice(0, 8)}).`,
          })
          continue
        }

        let leadId = leadIdFromDoc

        if (!leadId) {
          const insertLeadPayload = {
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
          }

          const { data: newLead, error: leadErr } = await supabase
            .from('leads')
            .insert(insertLeadPayload)
            .select('id, name, phone, email, cpf_cnpj')
            .single()

          if (leadErr || !newLead?.id) {
            errors.push({
              row: row.rowNumber,
              error: leadErr?.message || 'Falha ao criar lead.',
            })
            continue
          }

          leadId = newLead.id
          created++

          registerLeadMaps(
            {
              id: newLead.id,
              name: newLead.name ?? row.name,
              phone: newLead.phone,
              email: newLead.email,
              cpf_cnpj: newLead.cpf_cnpj,
            },
            existingLeadById,
            leadIdByDoc,
            leadIdByEmail,
            leadIdByPhone,
          )
        } else {
          const patch = buildLeadPatch(row)

          if (Object.keys(patch).length > 0) {
            const { error: updateErr } = await supabase
              .from('leads')
              .update(patch)
              .eq('id', leadId)
              .eq('company_id', companyId)

            if (updateErr) {
              errors.push({ row: row.rowNumber, error: updateErr.message })
              continue
            }
          }

          updated++

          const currentLead = existingLeadById.get(leadId)
          registerLeadMaps(
            {
              id: leadId,
              name: row.name || currentLead?.name || null,
              phone: row.phone || currentLead?.phone || null,
              email: row.email || currentLead?.email || null,
              cpf_cnpj: row.cpf_cnpj || currentLead?.cpf_cnpj || null,
            },
            existingLeadById,
            leadIdByDoc,
            leadIdByEmail,
            leadIdByPhone,
          )
        }

        if (!leadId) {
          errors.push({
            row: row.rowNumber,
            error: 'Falha interna: leadId não definido após processar a linha.',
          })
          continue
        }
        
        const resolvedLeadId = leadId

        const profilePayload = buildProfilePayload(companyId, resolvedLeadId, row)

        const { error: profileErr } = await supabase
          .from('lead_profiles')
          .upsert(profilePayload, { onConflict: 'lead_id' })

        if (profileErr) {
          errors.push({
            row: row.rowNumber,
            error: `Perfil: ${profileErr.message}`,
          })
          continue
        }

        let cycle = cycleByLeadId.get(resolvedLeadId) || null

        if (!cycle) {
          const { data: createdCycle, error: cycleErr } = await supabase
            .from('sales_cycles')
            .insert({
              company_id: companyId,
              lead_id: resolvedLeadId,
              owner_user_id: defaultOwnerUserId,
              status: 'novo',
              current_group_id: groupId || null,
              stage_entered_at: new Date().toISOString(),
            })
            .select('id, lead_id, current_group_id')
            .single()

          if (cycleErr || !createdCycle?.id) {
            errors.push({
              row: row.rowNumber,
              error: cycleErr?.message || 'Falha ao criar ciclo.',
            })
            continue
          }

          cycle = createdCycle as CycleRow
          cycleByLeadId.set(leadId, cycle)
          createdCycles++

          const { error: cycleCreatedEventErr } = await supabase
            .from('cycle_events')
            .insert({
              company_id: companyId,
              cycle_id: cycle.id,
              event_type: 'cycle_created',
              created_by: user.id,
              metadata: {
                lead_name: row.name,
                owner_user_id: defaultOwnerUserId,
                group_id: groupId || null,
                source: EVENT_SOURCES.cycle_create,
              },
              occurred_at: new Date().toISOString(),
            })

          void cycleCreatedEventErr

          if (groupId) {
            const { error: linkErr } = await supabase
              .from('lead_group_cycles')
              .insert({
                company_id: companyId,
                group_id: groupId,
                cycle_id: cycle.id,
                attached_by: user.id,
              })

            if (linkErr && !isDuplicateError(linkErr.message)) {
              errors.push({
                row: row.rowNumber,
                error: `Grupo: ${linkErr.message}`,
              })
            }

            const { error: groupEventErr } = await supabase
              .from('cycle_events')
              .insert({
                company_id: companyId,
                cycle_id: cycle.id,
                event_type: 'group_attached',
                created_by: user.id,
                metadata: { group_id: groupId },
                occurred_at: new Date().toISOString(),
              })

            void groupEventErr
          }
        } else if (groupId && !cycle.current_group_id) {
          const { error: cycleUpdateErr } = await supabase
            .from('sales_cycles')
            .update({ current_group_id: groupId })
            .eq('id', cycle.id)
            .eq('company_id', companyId)

          if (!cycleUpdateErr) {
            cycle.current_group_id = groupId
            cycleByLeadId.set(resolvedLeadId, cycle)

            const { error: linkErr } = await supabase
              .from('lead_group_cycles')
              .insert({
                company_id: companyId,
                group_id: groupId,
                cycle_id: cycle.id,
                attached_by: user.id,
              })

            if (linkErr && !isDuplicateError(linkErr.message)) {
              errors.push({
                row: row.rowNumber,
                error: `Grupo: ${linkErr.message}`,
              })
            }

            const { error: groupEventErr } = await supabase
              .from('cycle_events')
              .insert({
                company_id: companyId,
                cycle_id: cycle.id,
                event_type: 'group_attached',
                created_by: user.id,
                metadata: { group_id: groupId },
                occurred_at: new Date().toISOString(),
              })

            void groupEventErr
          }
        }
      } catch (e: any) {
        errors.push({
          row: row.rowNumber,
          error: e?.message || 'Erro inesperado ao processar linha.',
        })
      }
    }

    return NextResponse.json({
      ok: true,
      created,
      updated,
      created_cycles: createdCycles,
      errors,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}