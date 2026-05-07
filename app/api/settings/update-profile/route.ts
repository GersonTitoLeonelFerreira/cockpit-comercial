import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { getAuthedSupabase } from '@/app/lib/supabase/server'

function firstDefined<T = unknown>(...vals: T[]) {
  for (const v of vals) if (v !== undefined) return v
  return undefined
}

function s(v: unknown) {
  return String(v ?? '').trim()
}

function nullIfEmpty(v: unknown) {
  const t = s(v)
  return t ? t : null
}

function onlyDigits(v: unknown) {
  return s(v).replace(/\D/g, '')
}

async function getActiveCompanyId() {
  const cookieStore = await cookies()
  return cookieStore.get('cockpit_active_company_id')?.value ?? null
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Env NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.')
  }

  return createClient(url, serviceKey)
}

export async function POST(req: Request) {
  try {
    let supabase
    let authUser: { id: string }

    try {
      ;({ supabase, user: authUser } = await getAuthedSupabase())
    } catch {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>))

    const requestedTargetId = s(
      firstDefined(body.target_profile_id, body.profile_id, body.user_id),
    )

    let targetId = authUser.id

    const { data: currentProfile, error: currentProfileError } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', authUser.id)
      .maybeSingle()

    if (currentProfileError) {
      return NextResponse.json({ error: currentProfileError.message }, { status: 400 })
    }

    if (!currentProfile?.id) {
      return NextResponse.json(
        { error: 'Perfil do usuário logado não encontrado.' },
        { status: 403 },
      )
    }

    if (currentProfile.is_active_global === false) {
      return NextResponse.json({ error: 'Usuário globalmente inativo.' }, { status: 403 })
    }

    const adminClient = getAdminClient()

    if (requestedTargetId && requestedTargetId !== authUser.id) {
      const activeCompanyId = await getActiveCompanyId()

      if (!activeCompanyId) {
        return NextResponse.json(
          { error: 'Empresa ativa não selecionada.' },
          { status: 400 },
        )
      }

      const { data: actorMembership, error: actorMembershipError } = await supabase
        .from('company_memberships')
        .select('company_id, role, is_active')
        .eq('company_id', activeCompanyId)
        .eq('user_id', authUser.id)
        .eq('role', 'admin')
        .eq('is_active', true)
        .maybeSingle()

      if (actorMembershipError) {
        return NextResponse.json({ error: actorMembershipError.message }, { status: 400 })
      }

      if (!actorMembership) {
        return NextResponse.json(
          { error: 'Apenas admin ativo da empresa pode editar outro usuário.' },
          { status: 403 },
        )
      }

      const { data: targetMembership, error: targetMembershipError } = await adminClient
        .from('company_memberships')
        .select('company_id, user_id, is_active')
        .eq('company_id', activeCompanyId)
        .eq('user_id', requestedTargetId)
        .maybeSingle()

      if (targetMembershipError) {
        return NextResponse.json({ error: targetMembershipError.message }, { status: 400 })
      }

      if (!targetMembership?.user_id) {
        return NextResponse.json(
          { error: 'Usuário alvo não possui vínculo com a empresa ativa.' },
          { status: 403 },
        )
      }

      targetId = requestedTargetId
    }

    const full_name = s(firstDefined(body.full_name, body.nome, body.name))
    const username = s(
      firstDefined(body.username, body.user_name, body.user, body.apelido),
    )

    const phoneRaw = firstDefined(
      body.phone,
      body.telefone,
      body.celular,
      body.phone_mobile,
    )
    const phoneDigits = onlyDigits(phoneRaw)
    const phone = phoneDigits ? phoneDigits : null

    const legal_name = s(
      firstDefined(
        body.legal_name,
        body.nome_registro,
        body.nomeRegistro,
        body.legalName,
      ),
    )

    const birth_date = s(
      firstDefined(
        body.birth_date,
        body.data_nascimento,
        body.dataNascimento,
        body.birthDate,
      ),
    )

    const tipo_pessoa_in = s(firstDefined(body.tipo_pessoa, body.tipoPessoa))
    const cpf_in = onlyDigits(
      firstDefined(body.cpf, body.documento, body.cpf_cnpj),
    )

    if (!full_name) {
      return NextResponse.json({ error: 'Nome é obrigatório.' }, { status: 400 })
    }

    if (!legal_name) {
      return NextResponse.json(
        { error: 'Nome Registro é obrigatório.' },
        { status: 400 },
      )
    }

    if (!birth_date) {
      return NextResponse.json(
        { error: 'Data de nascimento é obrigatória.' },
        { status: 400 },
      )
    }

    if (!username) {
      return NextResponse.json(
        { error: 'Username é obrigatório.' },
        { status: 400 },
      )
    }

    const { data: targetProfile, error: targetErr } = await adminClient
      .from('profiles')
      .select('id, cpf')
      .eq('id', targetId)
      .maybeSingle()

    if (targetErr) {
      return NextResponse.json({ error: targetErr.message }, { status: 400 })
    }

    if (!targetProfile?.id) {
      return NextResponse.json(
        { error: 'Usuário alvo não encontrado em profiles.' },
        { status: 404 },
      )
    }

    const { data: savedProfile, error: profUpdErr } = await adminClient
      .from('profiles')
      .update({
        full_name,
        username,
        phone,
        job_title: nullIfEmpty(firstDefined(body.job_title, body.cargo)),
        birth_date: birth_date || null,
      })
      .eq('id', targetId)
      .select('id, full_name, username, phone, job_title, status, birth_date, cpf')
      .maybeSingle()

    if (profUpdErr) {
      return NextResponse.json({ error: profUpdErr.message }, { status: 400 })
    }

    if (!savedProfile?.id) {
      return NextResponse.json(
        { error: 'Não consegui atualizar profiles (0 linhas).' },
        { status: 400 },
      )
    }

    const { data: existingDetails, error: detReadErr } = await adminClient
      .from('profile_details')
      .select('profile_id, tipo_pessoa, cpf')
      .eq('profile_id', targetId)
      .maybeSingle()

    if (detReadErr) {
      return NextResponse.json({ error: detReadErr.message }, { status: 400 })
    }

    const detailsExists = !!existingDetails

    const cpfFinal = cpf_in || onlyDigits(targetProfile.cpf)
    const tipoFinal = tipo_pessoa_in

    if (!detailsExists) {
      const allowedTipo = new Set(['fisica', 'juridica', 'estrangeiro'])

      if (!allowedTipo.has(tipoFinal)) {
        return NextResponse.json(
          {
            error:
              'Para criar profile_details, informe tipo_pessoa (fisica/juridica/estrangeiro).',
          },
          { status: 400 },
        )
      }

      if (!cpfFinal) {
        return NextResponse.json(
          {
            error:
              'Para criar profile_details, informe CPF (ou preencha profiles.cpf).',
          },
          { status: 400 },
        )
      }
    } else {
      if (
        body.tipo_pessoa !== undefined ||
        body.tipoPessoa !== undefined ||
        body.cpf !== undefined
      ) {
        return NextResponse.json(
          { error: 'CPF e Tipo de pessoa são travados após inicialização.' },
          { status: 400 },
        )
      }
    }

    const cepDigits = onlyDigits(firstDefined(body.cep))

    const detailsUpdate = {
      legal_name,
      birth_date,
      profissao: nullIfEmpty(firstDefined(body.profissao, body.profession)),
      grau_instrucao: nullIfEmpty(
        firstDefined(body.grau_instrucao, body.education_level),
      ),
      estado_civil: nullIfEmpty(
        firstDefined(body.estado_civil, body.marital_status),
      ),
      rg: nullIfEmpty(firstDefined(body.rg)),
      orgao_emissor: nullIfEmpty(
        firstDefined(body.orgao_emissor, body.rg_issuer),
      ),
      estado_emissao: nullIfEmpty(
        firstDefined(body.estado_emissao, body.rg_state),
      ),
      web_page: nullIfEmpty(
        firstDefined(body.web_page, body.website, body.site),
      ),
      cep: cepDigits ? cepDigits : null,
      pais: nullIfEmpty(firstDefined(body.pais, body.address_country)),
      estado: nullIfEmpty(firstDefined(body.estado, body.address_state)),
      cidade: nullIfEmpty(firstDefined(body.cidade, body.address_city)),
      logradouro: nullIfEmpty(
        firstDefined(body.logradouro, body.address_street),
      ),
      numero: nullIfEmpty(firstDefined(body.numero, body.address_number)),
    }

    if (!detailsExists) {
      const { error: insErr } = await adminClient.from('profile_details').insert({
        profile_id: targetId,
        ...detailsUpdate,
        tipo_pessoa: tipoFinal,
        cpf: cpfFinal,
      })

      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 400 })
      }
    } else {
      const { error: updErr } = await adminClient
        .from('profile_details')
        .update(detailsUpdate)
        .eq('profile_id', targetId)

      if (updErr) {
        return NextResponse.json({ error: updErr.message }, { status: 400 })
      }
    }

    const { data: savedDetails } = await adminClient
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
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}