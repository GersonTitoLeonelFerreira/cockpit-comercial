import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type DeleteLeadsBody = {
  lead_ids?: unknown
  password?: unknown
}

type LeadForDelete = {
  id: string
  deleted_at: string | null
}

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

function normalizeLeadIds(value: unknown) {
  if (!Array.isArray(value)) return []

  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !anon || !serviceKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'ENV faltando: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY.',
        },
        { status: 500 },
      )
    }

    const body = (await req.json().catch(() => ({}))) as DeleteLeadsBody
    const password = typeof body.password === 'string' ? body.password.trim() : ''
    const leadIds = normalizeLeadIds(body.lead_ids)

    if (leadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nenhum lead informado para exclusão.' },
        { status: 400 },
      )
    }

    if (!password) {
      return NextResponse.json(
        { ok: false, error: 'Senha obrigatória.' },
        { status: 400 },
      )
    }

    if (leadIds.length > 500) {
      return NextResponse.json(
        { ok: false, error: 'Limite máximo de 500 leads por operação.' },
        { status: 400 },
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
          // Rota administrativa sem escrita de cookies.
        },
      },
    })

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user?.id || !user.email) {
      return NextResponse.json(
        { ok: false, error: 'Usuário não autenticado.' },
        { status: 401 },
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, is_active_global')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) {
      return NextResponse.json(
        { ok: false, error: profileError.message },
        { status: 400 },
      )
    }

    if (!profile?.id) {
      return NextResponse.json(
        { ok: false, error: 'Perfil do usuário logado não encontrado.' },
        { status: 403 },
      )
    }

    if (profile.is_active_global === false) {
      return NextResponse.json(
        { ok: false, error: 'Usuário globalmente inativo.' },
        { status: 403 },
      )
    }

    const { data: actorMembership, error: membershipError } = await supabase
      .from('company_memberships')
      .select('company_id, role, is_active')
      .eq('company_id', activeCompanyId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle()

    if (membershipError) {
      return NextResponse.json(
        { ok: false, error: membershipError.message },
        { status: 400 },
      )
    }

    const membership = actorMembership as MembershipRow | null

    if (!membership?.company_id) {
      return NextResponse.json(
        { ok: false, error: 'Usuário sem vínculo ativo com a empresa.' },
        { status: 403 },
      )
    }

    if (membership.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Apenas admin pode excluir leads.' },
        { status: 403 },
      )
    }

    const verifyRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: user.email,
        password,
      }),
    })

    if (!verifyRes.ok) {
      return NextResponse.json(
        { ok: false, error: 'Senha incorreta.' },
        { status: 401 },
      )
    }

    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })

    const companyId = membership.company_id

    const { data: leads, error: leadsError } = await admin
      .from('leads')
      .select('id, deleted_at')
      .eq('company_id', companyId)
      .in('id', leadIds)

    if (leadsError) {
      return NextResponse.json(
        { ok: false, error: leadsError.message },
        { status: 400 },
      )
    }

    const validLeads = (leads ?? []) as LeadForDelete[]
    const validLeadIds = validLeads.map((lead) => lead.id)
    const alreadyDeletedLeadIds = validLeads
      .filter((lead) => Boolean(lead.deleted_at))
      .map((lead) => lead.id)

    if (validLeadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nenhum lead válido encontrado para esta empresa.' },
        { status: 404 },
      )
    }

    if (validLeadIds.length !== leadIds.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'A operação foi bloqueada porque um ou mais leads não pertencem à empresa ativa ou não existem.',
        },
        { status: 403 },
      )
    }

    if (alreadyDeletedLeadIds.length > 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'A operação foi bloqueada porque um ou mais leads já estão excluídos.',
        },
        { status: 409 },
      )
    }

    const deletedAt = new Date().toISOString()

    const { data: updatedLeads, error: updateError } = await admin
      .from('leads')
      .update({
        deleted_at: deletedAt,
        deleted_by: user.id,
      })
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('id', validLeadIds)
      .select('id')

    if (updateError) {
      return NextResponse.json(
        { ok: false, error: updateError.message },
        { status: 400 },
      )
    }

    const softDeletedLeadIds = (updatedLeads ?? []).map((lead) => lead.id as string)

    if (softDeletedLeadIds.length !== validLeadIds.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'Nem todos os leads foram excluídos. A operação foi interrompida para evitar inconsistência.',
        },
        { status: 409 },
      )
    }

    const { error: auditError } = await admin.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: user.id,
      target_user_id: null,
      event_type: 'leads_soft_deleted',
      metadata: {
        lead_ids: softDeletedLeadIds,
        deleted_count: softDeletedLeadIds.length,
        deleted_at: deletedAt,
        source: 'pool',
      },
    })

    return NextResponse.json({
      ok: true,
      deleted_count: softDeletedLeadIds.length,
      warning: auditError ? `Leads excluídos, mas falhou auditoria: ${auditError.message}` : null,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error, 'Erro ao excluir leads.'),
      },
      { status: 500 },
    )
  }
}