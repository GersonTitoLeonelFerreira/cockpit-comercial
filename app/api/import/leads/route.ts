import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import * as XLSX from 'xlsx'

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

function guessLeadName(row: any) {
  return cleanStr(row.nome ?? row.name ?? row.Nome ?? row.NAME ?? row['Nome do lead'])
}

function guessPhone(row: any) {
  const p = onlyDigits(row.telefone ?? row.phone ?? row.Telefone ?? row.PHONE ?? row['Telefone'])
  return p ? p : null
}

/**
 * [Inference] Colunas possíveis no Excel:
 * cpf, cnpj, email, cep, rua, numero, complemento, bairro, cidade, estado, pais, razao_social
 * Ajuste conforme seu padrão de planilha.
 */
function pickProfileFields(row: any) {
  const cpf = onlyDigits(row.cpf ?? row.CPF)
  const cnpj = onlyDigits(row.cnpj ?? row.CNPJ)
  const email = normEmail(row.email ?? row['e-mail'] ?? row.Email ?? row['E-mail'])
  const cep = onlyDigits(row.cep ?? row.CEP)

  const lead_type_raw = cleanStr(row.tipo ?? row.Tipo ?? row.lead_type)
  const lead_type = lead_type_raw ? String(lead_type_raw).toUpperCase() : null // "PF" | "PJ"

  const razao_social = cleanStr(row.razao_social ?? row['Razão Social'] ?? row['razao social'])
  const rua = cleanStr(row.rua ?? row['Rua/Av.'] ?? row['Rua'] ?? row['logradouro'])
  const numero = cleanStr(row.numero ?? row['Número'] ?? row['Numero'])
  const complemento = cleanStr(row.complemento ?? row['Complemento'])
  const bairro = cleanStr(row.bairro ?? row['Bairro'])
  const cidade = cleanStr(row.cidade ?? row['Cidade'])
  const estado = cleanStr(row.estado ?? row['UF'] ?? row['Estado'])
  const pais = cleanStr(row.pais ?? row['País'] ?? row['Pais']) ?? 'Brasil'

  return {
    lead_type,
    cpf: cpf || null,
    cnpj: cnpj || null,
    email,
    cep: cep || null,
    razao_social,
    rua,
    numero,
    complemento,
    bairro,
    cidade,
    estado,
    pais,
  }
}

async function getAuthedSupabase() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return cookieStore.getAll()
        },
        async setAll() {},
      },
    }
  )

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) return { supabase, user: null as any, error: 'not_authenticated' }

  return { supabase, user: data.user, error: null as any }
}

export async function POST(req: Request) {
  try {
    const { supabase, user, error: authErr } = await getAuthedSupabase()
    if (authErr) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const form = await req.formData()

    const file = form.get('file')
    const list_id = String(form.get('list_id') ?? '').trim()
    const new_list_name = String(form.get('new_list_name') ?? '').trim()

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Arquivo não enviado.' }, { status: 400 })
    }

    // company_id do usuário
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profileErr || !profile?.company_id) {
      return NextResponse.json({ error: 'company_id não encontrado para o usuário.' }, { status: 400 })
    }

    const companyId = String(profile.company_id)

    // Resolve/Cria lista
    let resolvedListId: string | null = null

    if (list_id) resolvedListId = list_id

    if (!resolvedListId && new_list_name) {
      const { data: createdList, error: createListErr } = await supabase
        .from('lead_lists')
        .insert({
          company_id: companyId,
          name: new_list_name,
        })
        .select('id')
        .single()

      if (createListErr || !createdList?.id) {
        return NextResponse.json(
          { error: `Falha ao criar lista: ${createListErr?.message ?? 'erro'}` },
          { status: 400 }
        )
      }
      resolvedListId = String(createdList.id)
    }

    if (!resolvedListId) {
      return NextResponse.json({ error: 'Selecione uma lista ou crie uma nova.' }, { status: 400 })
    }

    // Ler XLSX
    const ab = await (file as Blob).arrayBuffer()
    const wb = XLSX.read(ab, { type: 'array' })

    const sheetName = wb.SheetNames?.[0]
    if (!sheetName) {
      return NextResponse.json({ error: 'Planilha vazia.' }, { status: 400 })
    }

    const ws = wb.Sheets[sheetName]
    const rows: any[] = XLSX.utils.sheet_to_json(ws, { defval: null })

    let total_rows = rows.length
    let valid_rows = 0
    let created = 0
    let updated = 0
    const errors: any[] = []

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const name = guessLeadName(row)
      const phone = guessPhone(row)

      if (!name && !phone) {
        // linha inválida (sem mínimo)
        continue
      }

      valid_rows++

      const profileFields = pickProfileFields(row)

      // Dedup (best-effort):
      // 1) CPF/CNPJ/Email via lead_profiles + join leads.company_id
      // 2) Phone via leads.phone
      let existingLeadId: string | null = null

      // [Inference] lead_profiles tem lead_id e se relaciona com leads
      if (profileFields.cpf) {
        const { data } = await supabase
          .from('lead_profiles')
          .select('lead_id, leads!inner(company_id)')
          .eq('cpf', profileFields.cpf)
          .eq('leads.company_id', companyId)
          .limit(1)

        if (data?.[0]?.lead_id) existingLeadId = String(data[0].lead_id)
      }

      if (!existingLeadId && profileFields.cnpj) {
        const { data } = await supabase
          .from('lead_profiles')
          .select('lead_id, leads!inner(company_id)')
          .eq('cnpj', profileFields.cnpj)
          .eq('leads.company_id', companyId)
          .limit(1)

        if (data?.[0]?.lead_id) existingLeadId = String(data[0].lead_id)
      }

      if (!existingLeadId && profileFields.email) {
        const { data } = await supabase
          .from('lead_profiles')
          .select('lead_id, leads!inner(company_id)')
          .eq('email', profileFields.email)
          .eq('leads.company_id', companyId)
          .limit(1)

        if (data?.[0]?.lead_id) existingLeadId = String(data[0].lead_id)
      }

      if (!existingLeadId && phone) {
        const { data } = await supabase
          .from('leads')
          .select('id')
          .eq('company_id', companyId)
          .eq('phone', phone)
          .limit(1)

        if (data?.[0]?.id) existingLeadId = String(data[0].id)
      }

      try {
        let leadIdToUse: string

        if (!existingLeadId) {
          // cria lead
          const { data: newLead, error: insErr } = await supabase
            .from('leads')
            .insert({
              company_id: companyId,
              owner_id: user.id,
              name: name ?? 'Lead',
              phone: phone,
              status: 'novo',
            })
            .select('id')
            .single()

          if (insErr || !newLead?.id) {
            errors.push({ row: i + 2, error: insErr?.message ?? 'Falha ao criar lead' })
            continue
          }

          leadIdToUse = String(newLead.id)
          created++
        } else {
          leadIdToUse = existingLeadId

          // atualiza dados básicos se vierem
          const patch: any = {}
          if (name) patch.name = name
          if (phone) patch.phone = phone

          if (Object.keys(patch).length) {
            const { error: upErr } = await supabase
              .from('leads')
              .update(patch)
              .eq('id', leadIdToUse)
              .eq('company_id', companyId)

            if (upErr) {
              errors.push({ row: i + 2, error: upErr.message })
              continue
            }
          }

          updated++
        }

        // Upsert profile (dados extras) — ajuste nomes de colunas se necessário
        // [Inference] lead_profiles PK = lead_id
        const profileUpsert: any = {
          lead_id: leadIdToUse,
          lead_type: profileFields.lead_type,
          cpf: profileFields.cpf,
          cnpj: profileFields.cnpj,
          email: profileFields.email,
          razao_social: profileFields.razao_social,
          cep: profileFields.cep,
          rua: profileFields.rua,
          numero: profileFields.numero,
          complemento: profileFields.complemento,
          bairro: profileFields.bairro,
          cidade: profileFields.cidade,
          estado: profileFields.estado,
          pais: profileFields.pais,
        }

        // remove nulls pra não sobrescrever com vazio
        Object.keys(profileUpsert).forEach((k) => {
          if (profileUpsert[k] === null || profileUpsert[k] === undefined || profileUpsert[k] === '') {
            delete profileUpsert[k]
          }
        })

        // se sobrou algo além do lead_id, salva
        if (Object.keys(profileUpsert).length > 1) {
          const { error: profErr } = await supabase
            .from('lead_profiles')
            .upsert(profileUpsert, { onConflict: 'lead_id' })

          if (profErr) {
            errors.push({ row: i + 2, error: `Perfil: ${profErr.message}` })
            // não aborta o lead, segue
          }
        }

        // vincula na lista/carteira
        const { error: linkErr } = await supabase
          .from('lead_list_members')
          .insert({
            company_id: companyId,
            list_id: resolvedListId,
            lead_id: leadIdToUse,
          })

        // se já existe, pode falhar por unique → ignorar
        if (linkErr && !String(linkErr.message).toLowerCase().includes('duplicate')) {
          // dependendo do supabase, vem "duplicate key value violates unique constraint"
          if (!String(linkErr.message).toLowerCase().includes('unique')) {
            errors.push({ row: i + 2, error: `Vínculo lista: ${linkErr.message}` })
          }
        }
      } catch (e: any) {
        errors.push({ row: i + 2, error: e?.message ?? 'Erro inesperado' })
      }
    }

    return NextResponse.json({
      total_rows,
      valid_rows,
      created,
      updated,
      errors,
      list_id: resolvedListId,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Erro inesperado' }, { status: 500 })
  }
}
