import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

function firstDefined<T = any>(...vals: T[]) {
  for (const v of vals) if (v !== undefined) return v
  return undefined
}
function s(v: any) {
  return String(v ?? '').trim()
}
function nullIfEmpty(v: any) {
  const t = s(v)
  return t ? t : null
}
function onlyDigits(v: any) {
  return s(v).replace(/\D/g, '')
}

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options),
              )
            } catch {}
          },
        },
      },
    )

    const { data: auth, error: authErr } = await supabase.auth.getUser()
    if (authErr || !auth?.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({} as any))

    // --- alvo (modo normal = salvar a si mesmo)
    const requestedTargetId = s(firstDefined(body?.target_profile_id, body?.profile_id, body?.user_id))
    let targetId = auth.user.id

    // se pediu para salvar outro usuário, valida se é admin
    if (requestedTargetId && requestedTargetId !== auth.user.id) {
      // regra simples: só permite se o usuário logado tem role 'admin' no profiles
      const { data: me, error: meErr } = await supabase
        .from('profiles')
        .select('id, role, company_id')
        .eq('id', auth.user.id)
        .maybeSingle()

      if (meErr) return NextResponse.json({ error: meErr.message }, { status: 400 })
      if (!me?.id) return NextResponse.json({ error: 'Perfil do usuário logado não encontrado.' }, { status: 400 })
      if (me.role !== 'admin') {
        return NextResponse.json({ error: 'Apenas admin pode editar outro usuário.' }, { status: 403 })
      }

      targetId = requestedTargetId
    }

    // --- campos (aceita variações)
    const full_name = s(firstDefined(body?.full_name, body?.nome, body?.name))
    const username = s(firstDefined(body?.username, body?.user_name, body?.user, body?.apelido))

    const phoneRaw = firstDefined(body?.phone, body?.telefone, body?.celular, body?.phone_mobile)
    const phoneDigits = onlyDigits(phoneRaw)
    const phone = phoneDigits ? phoneDigits : null

    const legal_name = s(firstDefined(body?.legal_name, body?.nome_registro, body?.nomeRegistro, body?.legalName))
    const birth_date = s(firstDefined(body?.birth_date, body?.data_nascimento, body?.dataNascimento, body?.birthDate))

    const tipo_pessoa_in = s(firstDefined(body?.tipo_pessoa, body?.tipoPessoa))
    const cpf_in = onlyDigits(firstDefined(body?.cpf, body?.documento, body?.cpf_cnpj))

    // validações mínimas
    if (!full_name) return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    if (!legal_name) return NextResponse.json({ error: 'Nome Registro é obrigatório.' }, { status: 400 })
    if (!birth_date) return NextResponse.json({ error: 'Data de nascimento é obrigatória.' }, { status: 400 })
    if (!username) return NextResponse.json({ error: 'Username é obrigatório.' }, { status: 400 })

    // garante que alvo existe em profiles e tem company_id
    const { data: targetProfile, error: targetErr } = await supabase
      .from('profiles')
      .select('id, company_id, cpf')
      .eq('id', targetId)
      .maybeSingle()

    if (targetErr) return NextResponse.json({ error: targetErr.message }, { status: 400 })
    if (!targetProfile?.id || !targetProfile?.company_id) {
      return NextResponse.json({ error: 'Usuário alvo não tem company_id em profiles.' }, { status: 400 })
    }

    // ✅ update profiles do alvo
    const { data: savedProfile, error: profUpdErr } = await supabase
      .from('profiles')
      .update({
        full_name,
        username,
        phone,
        job_title: nullIfEmpty(firstDefined(body?.job_title, body?.cargo)),
        birth_date: birth_date || null,
      })
      .eq('id', targetId)
      .select('id, full_name, username, phone, company_id, job_title, role, status')
      .maybeSingle()

    if (profUpdErr) return NextResponse.json({ error: profUpdErr.message }, { status: 400 })
    if (!savedProfile?.id) {
      return NextResponse.json({ error: 'Não consegui atualizar profiles (0 linhas).' }, { status: 400 })
    }

    // profile_details: verifica existência para o alvo
    const { data: existingDetails, error: detReadErr } = await supabase
      .from('profile_details')
      .select('profile_id, tipo_pessoa, cpf')
      .eq('profile_id', targetId)
      .maybeSingle()

    if (detReadErr) return NextResponse.json({ error: detReadErr.message }, { status: 400 })
    const detailsExists = !!existingDetails

    // se não existe, precisa tipo_pessoa/cpf (não pode null)
    // tenta inferir cpf a partir de profiles.cpf se não vier do body
    const cpfFinal = cpf_in || onlyDigits(targetProfile.cpf)
    const tipoFinal = tipo_pessoa_in

    if (!detailsExists) {
      const allowedTipo = new Set(['fisica', 'juridica', 'estrangeiro'])
      if (!allowedTipo.has(tipoFinal)) {
        return NextResponse.json(
          { error: 'Para criar profile_details, informe tipo_pessoa (fisica/juridica/estrangeiro).' },
          { status: 400 },
        )
      }
      if (!cpfFinal) {
        return NextResponse.json(
          { error: 'Para criar profile_details, informe CPF (ou preencha profiles.cpf).' },
          { status: 400 },
        )
      }
    } else {
      // trava cpf/tipo (não altera depois)
      if (body?.tipo_pessoa !== undefined || body?.tipoPessoa !== undefined || body?.cpf !== undefined) {
        return NextResponse.json(
          { error: 'CPF e Tipo de pessoa são travados após inicialização.' },
          { status: 400 },
        )
      }
    }

    const cepDigits = onlyDigits(firstDefined(body?.cep))
    const detailsUpdate: any = {
      legal_name,
      birth_date,
      profissao: nullIfEmpty(firstDefined(body?.profissao, body?.profession)),
      grau_instrucao: nullIfEmpty(firstDefined(body?.grau_instrucao, body?.education_level)),
      estado_civil: nullIfEmpty(firstDefined(body?.estado_civil, body?.marital_status)),
      rg: nullIfEmpty(firstDefined(body?.rg)),
      orgao_emissor: nullIfEmpty(firstDefined(body?.orgao_emissor, body?.rg_issuer)),
      estado_emissao: nullIfEmpty(firstDefined(body?.estado_emissao, body?.rg_state)),
      web_page: nullIfEmpty(firstDefined(body?.web_page, body?.website, body?.site)),
      cep: cepDigits ? cepDigits : null,
      pais: nullIfEmpty(firstDefined(body?.pais, body?.address_country)),
      estado: nullIfEmpty(firstDefined(body?.estado, body?.address_state)),
      cidade: nullIfEmpty(firstDefined(body?.cidade, body?.address_city)),
      logradouro: nullIfEmpty(firstDefined(body?.logradouro, body?.address_street)),
      numero: nullIfEmpty(firstDefined(body?.numero, body?.address_number)),
    }

    if (!detailsExists) {
      const { error: insErr } = await supabase.from('profile_details').insert({
        profile_id: targetId,
        ...detailsUpdate,
        tipo_pessoa: tipoFinal,
        cpf: cpfFinal,
      })
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
    } else {
      const { error: updErr } = await supabase
        .from('profile_details')
        .update(detailsUpdate)
        .eq('profile_id', targetId)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })
    }

    const { data: savedDetails } = await supabase
      .from('profile_details')
      .select('profile_id, tipo_pessoa, cpf, legal_name, birth_date')
      .eq('profile_id', targetId)
      .maybeSingle()

    return NextResponse.json({
      ok: true,
      target_profile_id: targetId,
      saved_profile: savedProfile,
      saved_details: savedDetails,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}