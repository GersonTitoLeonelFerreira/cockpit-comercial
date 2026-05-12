// ==============================================================================
// API: Sales Cycles
// Padrão do projeto: Next.js API routes com Supabase SSR
// ==============================================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import {
  MoveCycleStageRequest,
  AssignCycleOwnerRequest,
  SetNextActionRequest,
} from '@/app/types/sales_cycles'

// ============================================================================
// Helper: Authenticated Supabase Client
// ============================================================================

async function getAuthedSupabase() {
  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        async getAll() {
          return cookieStore.getAll()
        },
        async setAll() {},
      },
    }
  )

  const { data, error } = await supabase.auth.getUser()
  if (error || !data?.user) {
    throw new Error('Não autenticado.')
  }

  return { supabase, user: data.user, activeCompanyId }
}

// ============================================================================
// POST: Move Cycle Stage
// ============================================================================

export async function POST(req: Request) {
  try {
    const { supabase, activeCompanyId } = await getAuthedSupabase()

    if (!activeCompanyId) {
      return NextResponse.json(
        { error: 'Empresa ativa não selecionada.' },
        { status: 400 }
      )
    }

    const body = (await req.json()) as MoveCycleStageRequest

    if (!body.cycle_id || !body.to_status) {
      return NextResponse.json(
        { error: 'cycle_id e to_status são obrigatórios.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('rpc_move_cycle_stage_for_company', {
      p_company_id: activeCompanyId,
      p_cycle_id: body.cycle_id,
      p_to_status: body.to_status,
      p_metadata: body.metadata || {},
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const result = Array.isArray(data) ? data[0] : data

    if (result?.error_message || result?.error) {
      return NextResponse.json(
        { error: result.error_message ?? result.error },
        { status: 403 }
      )
    }

    return NextResponse.json({ ok: true, data: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ============================================================================
// Endpoints adicionais (PUT, PATCH, DELETE)
// ============================================================================

// PUT: Assign Cycle Owner (admin only)
export async function PUT(req: Request) {
  try {
    const { supabase, activeCompanyId } = await getAuthedSupabase()

    if (!activeCompanyId) {
      return NextResponse.json(
        { error: 'Empresa ativa não selecionada.' },
        { status: 400 }
      )
    }

    const body = (await req.json()) as AssignCycleOwnerRequest

    if (!body.cycle_id || !body.owner_user_id) {
      return NextResponse.json(
        { error: 'cycle_id e owner_user_id são obrigatórios.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('rpc_assign_cycle_owner_for_company', {
      p_company_id: activeCompanyId,
      p_cycle_id: body.cycle_id,
      p_owner_user_id: body.owner_user_id,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const result = Array.isArray(data) ? data[0] : data

    if (result?.error_message || result?.error) {
      return NextResponse.json(
        { error: result.error_message ?? result.error },
        { status: 403 }
      )
    }

    return NextResponse.json({ ok: true, data: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// PATCH: Set Next Action
export async function PATCH(req: Request) {
  try {
    const { supabase, activeCompanyId } = await getAuthedSupabase()

    if (!activeCompanyId) {
      return NextResponse.json(
        { error: 'Empresa ativa não selecionada.' },
        { status: 400 }
      )
    }

    const body = (await req.json()) as SetNextActionRequest

    if (!body.cycle_id) {
      return NextResponse.json({ error: 'cycle_id é obrigatório.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('rpc_set_next_action_for_company', {
      p_company_id: activeCompanyId,
      p_cycle_id: body.cycle_id,
      p_next_action: body.next_action,
      p_next_action_date: body.next_action_date,
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const result = Array.isArray(data) ? data[0] : data

    if (result?.error_message || result?.error) {
      return NextResponse.json(
        { error: result.error_message ?? result.error },
        { status: 403 }
      )
    }

    return NextResponse.json({ ok: true, data: result })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}