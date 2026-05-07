import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

function onlyDigits(value: string) {
  return (value || '').replace(/\D/g, '')
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anon) {
      return NextResponse.json(
        {
          error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY.',
        },
        { status: 500 },
      )
    }

    const cookieStore = await cookies()
    const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json(
        { error: 'Empresa ativa não selecionada.' },
        { status: 400 },
      )
    }

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Server Component: cannot set cookies from here.
          }
        },
      },
    })

    const { data: auth, error: authError } = await supabase.auth.getUser()

    if (authError || !auth.user?.id) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', auth.user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 400 })
    }

    if (!profile?.id) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 403 })
    }

    if (profile.is_active_global === false) {
      return NextResponse.json(
        { error: 'Usuário globalmente inativo.' },
        { status: 403 },
      )
    }

    const { data: actorMembership, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', auth.user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ error: membershipError.message }, { status: 400 })
    }

    const membership = actorMembership as MembershipRow | null

    if (!membership?.company_id) {
      return NextResponse.json(
        { error: 'Usuário sem vínculo ativo com a empresa.' },
        { status: 403 },
      )
    }

    if (membership.role !== 'admin') {
      return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))

    const trade_name = String(body?.trade_name ?? '').trim()
    const legal_name = String(body?.legal_name ?? '').trim()
    const cnpj = onlyDigits(String(body?.cnpj ?? ''))
    const segment = String(body?.segment ?? '').trim() || null
    const email = String(body?.email ?? '').trim() || null
    const phone = onlyDigits(String(body?.phone ?? '')) || null
    const city = String(body?.city ?? '').trim() || null
    const state = String(body?.state ?? '').trim() || null
    const cep = onlyDigits(String(body?.cep ?? '')) || null
    const address = String(body?.address ?? '').trim() || null

    if (!trade_name || !legal_name) {
      return NextResponse.json(
        { error: 'Razão social e Nome fantasia são obrigatórios.' },
        { status: 400 },
      )
    }

    const { error } = await supabase
      .from('companies')
      .update({
        name: trade_name || legal_name,
        legal_name,
        trade_name,
        cnpj,
        segment,
        email,
        phone,
        city,
        state,
        cep,
        address,
      })
      .eq('id', membership.company_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: getErrorMessage(error, 'Erro inesperado.') },
      { status: 500 },
    )
  }
}