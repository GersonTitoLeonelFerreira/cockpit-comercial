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

async function getActorCompanyAndRole() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) {
    return { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY' as const }
  }

  const cookieStore = await cookies()
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
  if (userErr) return { error: userErr.message }
  const actor = userData?.user
  if (!actor) return { error: 'Não autenticado' as const }

  const { data: actorProfile, error: actorProfileErr } = await supabase
    .from('profiles')
    .select('company_id, role')
    .eq('id', actor.id)
    .single()

    if (actorProfileErr) return { error: actorProfileErr.message }
  if (!actorProfile || actorProfile.role !== 'admin') return { error: 'Acesso negado (admin only)' as const }
  if (!actorProfile.company_id) return { error: 'company_id do admin não encontrado' as const }

  return { actorId: actor.id, companyId: actorProfile.company_id, ok: true as const }
}

function nullIfEmpty(v: any) {
  const s = (v ?? '').toString().trim()
  return s ? s : null
}
function onlyDigits(v: string) {
  return (v ?? '').replace(/\D/g, '')
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
  if ((actor as any).error) return NextResponse.json({ error: (actor as any).error }, { status: 401 })

  const { id } = await ctx.params
  const admin = createClient(envUrl, serviceKey)

  const { data: profile, error: profErr } = await admin
    .from('profiles')
    .select(
      'id, company_id, role, full_name, email, phone, job_title, status, username, birth_date, cpf, is_active, created_at',
    )
    .eq('id', id)
    .single()

  if (profErr) return NextResponse.json({ error: profErr.message }, { status: 400 })
  if (!profile) return NextResponse.json({ error: 'Vendedor não encontrado' }, { status: 404 })
  if (profile.company_id !== (actor as any).companyId) return NextResponse.json({ error: 'Acesso negado (empresa diferente)' }, { status: 403 })

  const { data: details, error: detErr } = await admin.from('profile_details').select('*').eq('profile_id', id).maybeSingle()
  if (detErr) return NextResponse.json({ ok: true, profile, details: null })
  return NextResponse.json({ ok: true, profile, details })
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
  if ((actor as any).error) return NextResponse.json({ error: (actor as any).error }, { status: 401 })

  const { id } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as PatchBody
  const admin = createClient(envUrl, serviceKey)

  // garante mesma empresa (e pega cpf)
  const { data: existing, error: existingErr } = await admin
    .from('profiles')
    .select('id, company_id, cpf')
    .eq('id', id)
    .single()

  if (existingErr) return NextResponse.json({ error: existingErr.message }, { status: 400 })
  if (!existing) return NextResponse.json({ error: 'Vendedor não encontrado' }, { status: 404 })
  if (existing.company_id !== (actor as any).companyId) return NextResponse.json({ error: 'Acesso negado (empresa diferente)' }, { status: 403 })

  // Detecta existência de details de um jeito que não depende de maybeSingle()
  const { data: detRows, error: detRowsErr } = await admin
    .from('profile_details')
    .select('profile_id')
    .eq('profile_id', id)
    .limit(1)

  if (detRowsErr) return NextResponse.json({ error: detRowsErr.message }, { status: 400 })
  const detailsExists = (detRows?.length ?? 0) > 0

  // travas
  if (detailsExists) {
    if (body.tipo_pessoa !== undefined || body.cpf !== undefined) {
      return NextResponse.json(
        { error: 'CPF e Tipo de pessoa são campos travados e não podem ser alterados após inicialização.' },
        { status: 400 },
      )
    }
  } else {
    // se for inicializar, precisa garantir NOT NULL
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

  // update profiles
  const profileUpdate: any = {}
  if (body.full_name !== undefined) profileUpdate.full_name = body.full_name.trim()
  if (body.phone !== undefined) profileUpdate.phone = nullIfEmpty(body.phone)
  if (body.job_title !== undefined) profileUpdate.job_title = nullIfEmpty(body.job_title)
  if (body.username !== undefined) profileUpdate.username = nullIfEmpty(body.username)
  if (body.status !== undefined) profileUpdate.status = nullIfEmpty(body.status)
  if (body.role !== undefined) profileUpdate.role = body.role
  if (body.is_active !== undefined) profileUpdate.is_active = !!body.is_active

  if (Object.keys(profileUpdate).length) {
    const { error: upErr } = await admin.from('profiles').update(profileUpdate).eq('id', id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
  }

  // monta update/insert de details
  const detailsData: any = {}

  // Só no INSERT
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

  for (const k of optFields) {
    if ((body as any)[k] !== undefined) detailsData[k] = nullIfEmpty((body as any)[k])
  }

  if (!detailsExists) {
    // INSERT
    const { error: insErr } = await admin.from('profile_details').insert(detailsData)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
  } else {
    // UPDATE (nunca insere, nunca mexe em tipo_pessoa/cpf/profile_id)
    if (Object.keys(detailsData).length) {
      const { error: updErr } = await admin.from('profile_details').update(detailsData).eq('profile_id', id)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true, details_exists: detailsExists })
}