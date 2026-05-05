import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'

type DeleteLeadsBody = {
  lead_ids?: unknown
  password?: unknown
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
        .filter(Boolean)
    )
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
        { status: 500 }
      )
    }

    const body = (await req.json().catch(() => ({}))) as DeleteLeadsBody
    const password = typeof body.password === 'string' ? body.password.trim() : ''
    const leadIds = normalizeLeadIds(body.lead_ids)

    if (leadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nenhum lead informado para exclusão.' },
        { status: 400 }
      )
    }

    if (!password) {
      return NextResponse.json(
        { ok: false, error: 'Senha obrigatória.' },
        { status: 400 }
      )
    }

    if (leadIds.length > 500) {
      return NextResponse.json(
        { ok: false, error: 'Limite máximo de 500 leads por operação.' },
        { status: 400 }
      )
    }

    const cookieStore = await cookies()

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
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('company_id, role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile?.company_id) {
      return NextResponse.json(
        { ok: false, error: 'Perfil administrativo não encontrado.' },
        { status: 403 }
      )
    }

    if (profile.role !== 'admin') {
      return NextResponse.json(
        { ok: false, error: 'Apenas admin pode excluir leads.' },
        { status: 403 }
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
        { status: 401 }
      )
    }

    const admin = createClient(url, serviceKey)
    const companyId = profile.company_id as string

    const { data: leads, error: leadsError } = await admin
      .from('leads')
      .select('id')
      .eq('company_id', companyId)
      .in('id', leadIds)

    if (leadsError) {
      return NextResponse.json(
        { ok: false, error: leadsError.message },
        { status: 400 }
      )
    }

    const validLeadIds = (leads ?? []).map((lead) => lead.id as string)

    if (validLeadIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: 'Nenhum lead válido encontrado para esta empresa.' },
        { status: 404 }
      )
    }

    if (validLeadIds.length !== leadIds.length) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'A operação foi bloqueada porque um ou mais leads não pertencem à empresa do admin ou não existem.',
        },
        { status: 403 }
      )
    }

    const { error: deleteError } = await admin
      .from('leads')
      .delete()
      .eq('company_id', companyId)
      .in('id', validLeadIds)

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 400 }
      )
    }

    const { error: auditError } = await admin.from('admin_events').insert({
      company_id: companyId,
      actor_user_id: user.id,
      target_user_id: null,
      event_type: 'leads_deleted',
      metadata: {
        lead_ids: validLeadIds,
        deleted_count: validLeadIds.length,
        source: 'pool',
      },
    })

    return NextResponse.json({
      ok: true,
      deleted_count: validLeadIds.length,
      warning: auditError ? `Leads excluídos, mas falhou auditoria: ${auditError.message}` : null,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: getErrorMessage(error, 'Erro ao excluir leads.'),
      },
      { status: 500 }
    )
  }
}