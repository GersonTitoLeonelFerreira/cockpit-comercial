import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type SitePriorityLead = {
  id: string
  name: string
  phone: string | null
  email: string | null
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anon || !serviceKey) {
      return NextResponse.json(
        { ok: false, error: 'Configuração do Kanban indisponível.' },
        { status: 500 },
      )
    }

    const cookieStore = await cookies()
    const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json(
        { ok: false, error: 'Empresa ativa não selecionada.' },
        { status: 400 },
      )
    }

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Endpoint somente de leitura.
        },
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user?.id) {
      return NextResponse.json({ ok: false, error: 'Usuário não autenticado.' }, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json({ ok: false, error: profileError.message }, { status: 400 })
    }

    if (!profile?.id || profile.is_active_global === false) {
      return NextResponse.json({ ok: false, error: 'Usuário sem acesso ativo.' }, { status: 403 })
    }

    const { data: membershipData, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json({ ok: false, error: membershipError.message }, { status: 400 })
    }

    const membership = membershipData as MembershipRow | null

    if (!membership?.company_id) {
      return NextResponse.json({ ok: false, error: 'Usuário sem vínculo ativo com a empresa.' }, { status: 403 })
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    let query = admin
      .from('v_kanban_items')
      .select('id, name, phone, email')
      .eq('company_id', activeCompanyId)
      .eq('entry_mode', 'import_api')
      .eq('status', 'novo')
      .not('owner_id', 'is', null)
      .order('stage_entered_at', { ascending: false })
      .limit(100)

    const canViewTeam = membership.role === 'admin' || membership.role === 'manager'

    if (!canViewTeam) {
      query = query.eq('owner_id', user.id)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      leads: (data ?? []) as SitePriorityLead[],
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : 'Erro ao carregar prioridades do Kanban.',
      },
      { status: 500 },
    )
  }
}
