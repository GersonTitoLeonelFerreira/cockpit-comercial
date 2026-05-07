import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type PatchBody = {
  full_name?: string
  phone?: string | null
  job_title?: string | null
  username?: string | null
  status?: string | null
  role?: 'admin' | 'manager' | 'member'
  is_active?: boolean

  // details
  tipo_pessoa?: 'fisica' | 'juridica' | 'estrangeiro'
  cpf?: string
  legal_name?: string
  birth_date?: string

  nacionalidade?: string | null
  naturalidade?: string | null
  rg?: string | null
  orgao_emissor?: string | null
  estado_emissao?: string | null
  sexo_biologico?: string | null
  genero?: string | null
  estado_civil?: string | null
  profissao?: string | null
  grau_instrucao?: string | null
  contato_emergencia?: string | null
  telefone_emergencia?: string | null
  pais?: string | null
  estado?: string | null
  cidade?: string | null
  logradouro?: string | null
  numero?: string | null
  web_page?: string | null
  cep?: string | null
}

type ActorContext =
  | {
      ok: true
      actorId: string
      companyId: string
    }
  | {
      ok: false
      error: string
      status: number
    }

type MembershipRow = {
  user_id: string
  company_id: string
  role: 'admin' | 'manager' | 'member' | null
  is_active: boolean | null
}

type SellerProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  status: string | null
  username: string | null
  birth_date: string | null
  cpf: string | null
  created_at: string | null
}

async function getActorCompanyAndRole(): Promise<ActorContext> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    return {
      ok: false,
      error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY',
      status: 500,
    }
  }

  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    return {
      ok: false,
      error: 'Empresa ativa não selecionada.',
      status: 400,
    }
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {}
      },
    },
  })

  const { data: userData, error: userErr } = await supabase.auth.getUser()

  if (userErr) {
    return { ok: false, error: userErr.message, status: 401 }
  }

  const actor = userData?.user

  if (!actor?.id) {
    return { ok: false, error: 'Não autenticado', status: 401 }
  }

  const { data: actorProfile, error: actorProfileErr } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', actor.id)
    .maybeSingle()

  if (actorProfileErr) {
    return { ok: false, error: actorProfileErr.message, status: 400 }
  }

  if (!actorProfile?.id) {
    return { ok: false, error: 'Perfil do usuário logado não encontrado.', status: 403 }
  }

  if (actorProfile.is_active_global === false) {
    return { ok: false, error: 'Usuário globalmente inativo.', status: 403 }
  }

  const { data: actorMembership, error: actorMembershipErr } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', actor.id)
    .eq('is_active', true)
    .maybeSingle()

  if (actorMembershipErr) {
    return { ok: false, error: actorMembershipErr.message, status: 400 }
  }

  if (!actorMembership?.company_id) {
    return { ok: false, error: 'Usuário sem vínculo ativo com a empresa.', status: 403 }
  }

  if (actorMembership.role !== 'admin') {
    return { ok: false, error: 'Acesso negado (admin only)', status: 403 }
  }

  return {
    ok: true,
    actorId: actor.id,
    companyId: actorMembership.company_id,
  }
}

function nullIfEmpty(value: unknown) {
  const text = String(value ?? '').trim()
  return text ? text : null
}

function onlyDigits(value: string) {
  return (value ?? '').replace(/\D/g, '')
}

function buildSellerPayload(profile: SellerProfileRow, membership: MembershipRow) {
  return {
    id: profile.id,
    company_id: membership.company_id,
    role: membership.role,
    is_active: membership.is_active !== false,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    job_title: profile.job_title,
    status: profile.status,
    username: profile.username,
    birth_date: profile.birth_date,
    cpf: profile.cpf,
    created_at: profile.created_at,
  }
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!envUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    )
  }

  const actor = await getActorCompanyAndRole()

  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status })
  }

  const { id } = await ctx.params

  const admin = createClient(envUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: targetMembership, error: membershipErr } = await admin
    .from('company_memberships')
    .select('user_id, company_id, role, is_active')
    .eq('user_id', id)
    .eq('company_id', actor.companyId)
    .maybeSingle()

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 400 })
  }

  if (!targetMembership?.user_id) {
    return NextResponse.json({ error: 'Vendedor não encontrado nesta empresa.' }, { status: 404 })
  }

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select('id, full_name, email, phone, job_title, status, username, birth_date, cpf, created_at')
    .eq('id', id)
    .maybeSingle()

  if (profErr) {
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  if (!profile?.id) {
    return NextResponse.json({ error: 'Perfil do vendedor não encontrado.' }, { status: 404 })
  }

  const { data: details, error: detErr } = await admin
    .from('profile_details')
    .select('*')
    .eq('profile_id', id)
    .maybeSingle()

  if (detErr) {
    return NextResponse.json({
      ok: true,
      profile: buildSellerPayload(profile as SellerProfileRow, targetMembership as MembershipRow),
      details: null,
    })
  }

  return NextResponse.json({
    ok: true,
    profile: buildSellerPayload(profile as SellerProfileRow, targetMembership as MembershipRow),
    details,
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const envUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!envUrl || !serviceKey) {
    return NextResponse.json(
      { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 },
    )
  }

  const actor = await getActorCompanyAndRole()

  if (!actor.ok) {
    return NextResponse.json({ error: actor.error }, { status: actor.status })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as PatchBody

  const admin = createClient(envUrl, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: targetMembership, error: membershipErr } = await admin
    .from('company_memberships')
    .select('user_id, company_id, role, is_active')
    .eq('user_id', id)
    .eq('company_id', actor.companyId)
    .maybeSingle()

  if (membershipErr) {
    return NextResponse.json({ error: membershipErr.message }, { status: 400 })
  }

  if (!targetMembership?.user_id) {
    return NextResponse.json({ error: 'Vendedor não encontrado nesta empresa.' }, { status: 404 })
  }

  const { data: existing, error: existingErr } = await admin
    .from('profiles')
    .select('id, cpf')
    .eq('id', id)
    .maybeSingle()

  if (existingErr) {
    return NextResponse.json({ error: existingErr.message }, { status: 400 })
  }

  if (!existing?.id) {
    return NextResponse.json({ error: 'Perfil do vendedor não encontrado.' }, { status: 404 })
  }

  const { data: detRows, error: detRowsErr } = await admin
    .from('profile_details')
    .select('profile_id')
    .eq('profile_id', id)
    .limit(1)

  if (detRowsErr) {
    return NextResponse.json({ error: detRowsErr.message }, { status: 400 })
  }

  const detailsExists = (detRows?.length ?? 0) > 0

  if (detailsExists) {
    if (body.tipo_pessoa !== undefined || body.cpf !== undefined) {
      return NextResponse.json(
        { error: 'CPF e Tipo de pessoa são campos travados e não podem ser alterados após inicialização.' },
        { status: 400 },
      )
    }
  } else {
    const allowedTipo = new Set(['fisica', 'juridica', 'estrangeiro'])
    const tipo = (body.tipo_pessoa ?? 'fisica').trim()
    const cpfDigits = onlyDigits(body.cpf ?? '') || onlyDigits(existing.cpf ?? '')

    if (!allowedTipo.has(tipo)) {
      return NextResponse.json(
        { error: 'Informe tipo_pessoa válido para inicializar (fisica/juridica/estrangeiro).' },
        { status: 400 },
      )
    }

    if (!cpfDigits) {
      return NextResponse.json(
        { error: 'CPF não encontrado para inicializar. Envie cpf no PATCH ou preencha profiles.cpf.' },
        { status: 400 },
      )
    }
  }

  const profileUpdate: Record<string, unknown> = {}

  if (body.full_name !== undefined) profileUpdate.full_name = body.full_name.trim()
  if (body.phone !== undefined) profileUpdate.phone = nullIfEmpty(body.phone)
  if (body.job_title !== undefined) profileUpdate.job_title = nullIfEmpty(body.job_title)
  if (body.username !== undefined) profileUpdate.username = nullIfEmpty(body.username)
  if (body.status !== undefined) profileUpdate.status = nullIfEmpty(body.status)

  if (Object.keys(profileUpdate).length) {
    const { error: upErr } = await admin.from('profiles').update(profileUpdate).eq('id', id)

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 })
    }
  }

  const membershipUpdate: Record<string, unknown> = {}

  if (body.role !== undefined) membershipUpdate.role = body.role
  if (body.is_active !== undefined) membershipUpdate.is_active = Boolean(body.is_active)

  if (Object.keys(membershipUpdate).length) {
    const { error: membershipUpdateErr } = await admin
      .from('company_memberships')
      .update(membershipUpdate)
      .eq('user_id', id)
      .eq('company_id', actor.companyId)

    if (membershipUpdateErr) {
      return NextResponse.json({ error: membershipUpdateErr.message }, { status: 400 })
    }
  }

  const detailsData: Record<string, unknown> = {}

  if (!detailsExists) {
    detailsData.profile_id = id
    detailsData.tipo_pessoa = (body.tipo_pessoa ?? 'fisica').trim()
    detailsData.cpf = onlyDigits(body.cpf ?? '') || onlyDigits(existing.cpf ?? '')
  }

  if (body.legal_name !== undefined) detailsData.legal_name = body.legal_name.trim()
  if (body.birth_date !== undefined) detailsData.birth_date = body.birth_date

  const optFields = [
    'nacionalidade',
    'naturalidade',
    'rg',
    'orgao_emissor',
    'estado_emissao',
    'sexo_biologico',
    'genero',
    'estado_civil',
    'profissao',
    'grau_instrucao',
    'contato_emergencia',
    'telefone_emergencia',
    'pais',
    'estado',
    'cidade',
    'logradouro',
    'numero',
    'web_page',
    'cep',
  ] as const

  for (const key of optFields) {
    if (body[key] !== undefined) detailsData[key] = nullIfEmpty(body[key])
  }

  if (!detailsExists) {
    const { error: insErr } = await admin.from('profile_details').insert(detailsData)

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 400 })
    }
  } else if (Object.keys(detailsData).length) {
    const { error: updErr } = await admin
      .from('profile_details')
      .update(detailsData)
      .eq('profile_id', id)

    if (updErr) {
      return NextResponse.json({ error: updErr.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true, details_exists: detailsExists })
}