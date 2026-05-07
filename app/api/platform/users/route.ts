import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type MembershipUserRow = {
  user_id: string
  role: string
  is_active: boolean
  created_at: string | null
  profiles: {
    id: string
    full_name: string | null
    email: string | null
    phone: string | null
    job_title: string | null
    created_at: string | null
  } | null
}

async function getAdminActor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !anon) {
    throw new Error('ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }

  const cookieStore = await cookies()

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {
        // API route de leitura da sessão.
      },
    },
  })

  const { data: auth, error: authErr } = await supabase.auth.getUser()

  if (authErr) throw new Error(authErr.message)
  if (!auth?.user?.id) throw new Error('Não autenticado')

  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    throw new Error('Empresa ativa não selecionada.')
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', auth.user.id)
    .single()

  if (profileErr) throw new Error(profileErr.message)
  if (!profile?.id) throw new Error('Perfil do usuário logado não encontrado.')
  if (profile.is_active_global === false) throw new Error('Usuário globalmente inativo.')

  const { data: membership, error: membershipErr } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', auth.user.id)
    .eq('role', 'admin')
    .eq('is_active', true)
    .maybeSingle()

  if (membershipErr) throw new Error(membershipErr.message)
  if (!membership) throw new Error('Acesso negado: admin ativo da empresa obrigatório.')

  return {
    actorId: auth.user.id,
    companyId: membership.company_id,
  }
}

export async function GET() {
  try {
    const { companyId } = await getAdminActor()

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !serviceKey) {
      return NextResponse.json(
        { error: 'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 },
      )
    }

    const admin = createClient(url, serviceKey)

    const { data, error } = await admin
      .from('company_memberships')
      .select(
        `
        user_id,
        role,
        is_active,
        created_at,
        profiles:user_id (
          id,
          full_name,
          email,
          phone,
          job_title,
          created_at
        )
      `,
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const users = ((data ?? []) as unknown as MembershipUserRow[])
      .map((row) => {
        const profile = row.profiles

        return {
          id: row.user_id,
          full_name: profile?.full_name ?? null,
          email: profile?.email ?? null,
          phone: profile?.phone ?? null,
          job_title: profile?.job_title ?? null,
          role: row.role,
          is_active: row.is_active === true,
          created_at: profile?.created_at ?? row.created_at ?? null,
        }
      })
      .sort((a, b) => {
        const aName = a.full_name || a.email || ''
        const bName = b.full_name || b.email || ''
        return aName.localeCompare(bName, 'pt-BR')
      })

    return NextResponse.json({
      ok: true,
      company_id: companyId,
      users,
    })
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Erro inesperado' },
      { status: 500 },
    )
  }
}