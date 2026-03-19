import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type Body = {
  email?: string
  full_name?: string
  role?: string
  details?: {
    tipo_pessoa?: 'fisica' | 'juridica' | 'estrangeiro'
    legal_name?: string
    birth_date?: string // yyyy-mm-dd
    cpf?: string
    phone?: string | null
  }
}

function normalizeRole(role: string | undefined) {
  const r = (role ?? 'member').trim()
  if (r === 'consultor') return 'member'
  return r
}

function onlyDigits(s: string) {
  return (s ?? '').replace(/\D/g, '')
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    console.log('[invite] env check', {
      NEXT_PUBLIC_SUPABASE_URL: url ? 'OK' : 'MISSING',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anon ? 'OK' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: serviceKey ? 'OK' : 'MISSING',
    })

    if (!url || !anon) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        { status: 500 },
      )
    }
    if (!serviceKey) {
      return NextResponse.json(
        {
          error:
            'ENV faltando: SUPABASE_SERVICE_ROLE_KEY (reinicie o npm run dev após editar .env.local)',
        },
        { status: 500 },
      )
    }

    const body = (await req.json()) as Body
    const email = (body.email ?? '').trim().toLowerCase()
    const full_name = (body.full_name ?? '').trim()
    const role = normalizeRole(body.role)

    const details = body.details ?? {}
    const tipo_pessoa = (details.tipo_pessoa ?? '').trim() as any
    const legal_name = (details.legal_name ?? '').trim()
    const birth_date = (details.birth_date ?? '').trim()
    const cpf = onlyDigits(details.cpf ?? '')
    const phone = (details.phone ?? null)?.toString().trim() || null

    const allowedRoles = new Set(['admin', 'manager', 'member'])
    const allowedTipo = new Set(['fisica', 'juridica', 'estrangeiro'])

    if (!email) return NextResponse.json({ error: 'Campo obrigatório: email' }, { status: 400 })
    if (!full_name) return NextResponse.json({ error: 'Campo obrigatório: full_name (Nome)' }, { status: 400 })
    if (!allowedRoles.has(role)) {
      return NextResponse.json(
        { error: 'Role inválida. Use: admin | manager | member' },
        { status: 400 },
      )
    }

    // obrigatórios do cadastro
    if (!allowedTipo.has(tipo_pessoa)) {
      return NextResponse.json(
        { error: 'Campo obrigatório: tipo_pessoa (fisica|juridica|estrangeiro)' },
        { status: 400 },
      )
    }
    if (!legal_name) return NextResponse.json({ error: 'Campo obrigatório: legal_name (Nome Registro)' }, { status: 400 })
    if (!birth_date) return NextResponse.json({ error: 'Campo obrigatório: birth_date' }, { status: 400 })
    if (!cpf) return NextResponse.json({ error: 'Campo obrigatório: cpf' }, { status: 400 })

    // 1) Validar sessão do admin logado (cookie)
    const cookieStore = await cookies()
    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {}
        },
      },
    })

    const { data: userData, error: userErr } = await supabase.auth.getUser()
    if (userErr) return NextResponse.json({ error: userErr.message }, { status: 401 })

    const actor = userData?.user
    if (!actor) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })

    const { data: actorProfile, error: actorProfileErr } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('id', actor.id)
      .single()

    if (actorProfileErr) return NextResponse.json({ error: actorProfileErr.message }, { status: 400 })
    if (!actorProfile || actorProfile.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado (admin only)' }, { status: 403 })
    }

    const company_id = actorProfile.company_id
    if (!company_id) {
      return NextResponse.json({ error: 'company_id do admin não encontrado' }, { status: 400 })
    }

    // 2) Service role: criar usuário no Auth + profile + details + auditoria
    const admin = createClient(url, serviceKey)

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      email_confirm: false,
      user_metadata: {
        full_name: full_name || email,
        role,
        company_id,
      },
    })

    if (createErr) {
      return NextResponse.json({ error: createErr.message }, { status: 400 })
    }

    const userId = created.user?.id
    if (!userId) return NextResponse.json({ error: 'Usuário criado sem ID.' }, { status: 500 })

    // profiles (mínimo)
    const { error: profileErr } = await admin.from('profiles').upsert({
      id: userId,
      company_id,
      email,
      full_name: full_name || email,
      role,
      is_active: true,
      phone,
      cpf,
      birth_date, // ok: Postgres vai converter string yyyy-mm-dd para date/timestamptz conforme coluna
    })

    if (profileErr) {
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: `Falha ao criar profile: ${profileErr.message}` }, { status: 400 })
    }

    // profile_details (cadastro completo)
    const { error: detailsErr } = await admin.from('profile_details').upsert({
      profile_id: userId,
      tipo_pessoa,
      legal_name,
      birth_date,
      cpf,
      // opcional por enquanto
      web_page: null,
      pais: null,
      estado: null,
      cidade: null,
      logradouro: null,
      numero: null,
      telefone_emergencia: null,
      contato_emergencia: null,
      // ... os demais ficam null e serão preenchidos no detalhe
    })

    if (detailsErr) {
      // se falhar details, remove o user para não ficar cadastro “meio criado”
      await admin.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: `Falha ao criar profile_details: ${detailsErr.message}` }, { status: 400 })
    }

    const { error: auditErr } = await admin.from('admin_events').insert({
      company_id,
      actor_user_id: actor.id,
      target_user_id: userId,
      event_type: 'seller_created',
      metadata: { email, role },
    })

    if (auditErr) {
      return NextResponse.json(
        { ok: true, user_id: userId, warning: `Usuário criado, mas falhou auditoria: ${auditErr.message}` },
        { status: 200 },
      )
    }

    return NextResponse.json({ ok: true, user_id: userId })
  } catch (e: any) {
    console.error('[invite] unexpected error', e)
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 500 })
  }
}