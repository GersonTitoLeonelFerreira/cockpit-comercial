import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type CompanyMembership = {
  company_id: string
  company_name: string | null
  trade_name: string | null
  legal_name: string | null
  role: 'admin' | 'manager' | 'member'
  is_active: boolean
}

function getCompanyDisplayName(company: CompanyMembership) {
  return (
    company.trade_name ||
    company.company_name ||
    company.legal_name ||
    'Empresa sem nome'
  )
}

export async function GET() {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anon) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY' },
        { status: 500 },
      )
    }

    const cookieStore = await cookies()

    const supabase = createServerClient(url, anon, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // Server route de leitura.
        },
      },
    })

    const { data: auth, error: authErr } = await supabase.auth.getUser()

    if (authErr) {
      return NextResponse.json({ error: authErr.message }, { status: 401 })
    }

    if (!auth.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('id, full_name, email, is_active_global, is_platform_admin')
      .eq('id', auth.user.id)
      .single()

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 400 })
    }

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 })
    }

    if (profile.is_active_global === false) {
      return NextResponse.json({ error: 'Usuário globalmente inativo.' }, { status: 403 })
    }

    const { data: membershipsData, error: membershipsErr } = await supabase.rpc(
      'get_user_company_memberships',
    )

    if (membershipsErr) {
      return NextResponse.json({ error: membershipsErr.message }, { status: 400 })
    }

    const companies = ((membershipsData ?? []) as CompanyMembership[]).map((company) => ({
      company_id: company.company_id,
      company_name: company.company_name,
      trade_name: company.trade_name,
      legal_name: company.legal_name,
      display_name: getCompanyDisplayName(company),
      role: company.role,
      is_active: company.is_active,
    }))

    const activeCompanyCookie = cookieStore.get('cockpit_active_company_id')?.value ?? null

    const activeCompany =
      companies.find((company) => company.company_id === activeCompanyCookie) ??
      (companies.length === 1 ? companies[0] : null)

    const requiresCompanySelection =
      companies.length > 1 && !activeCompany

    return NextResponse.json({
      ok: true,

      user_id: auth.user.id,
      profile_id: profile.id,
      full_name: profile.full_name ?? null,
      email: profile.email ?? auth.user.email ?? null,

      is_active_global: profile.is_active_global !== false,
      is_platform_admin: profile.is_platform_admin === true,

      companies,
      companies_count: companies.length,

      active_company_id: activeCompany?.company_id ?? null,
      active_company_name: activeCompany?.display_name ?? null,
      active_role: activeCompany?.role ?? null,

      requires_company_selection: requiresCompanySelection,

      // Campos temporários de compatibilidade com consumidores ainda não migrados.
      // Serão removidos depois que AppShell, Pool, Kanban, relatórios e APIs
      // passarem a usar active_company_id/active_role/company_memberships.
      company_id: activeCompany?.company_id ?? null,
      role: activeCompany?.role ?? null,
      is_active: profile.is_active_global !== false && (activeCompany?.is_active ?? true),
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Erro inesperado',
      },
      { status: 500 },
    )
  }
}