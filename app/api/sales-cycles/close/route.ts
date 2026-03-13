// ==============================================================================
// API: Close Cycle (WON/LOST)
// ==============================================================================

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { CloseCycleWonRequest, CloseCycleLostRequest } from '@/app/types/sales_cycles'

async function getAuthedSupabase() {
  const cookieStore = await cookies()

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

  return { supabase, user: data.user }
}

// POST /api/sales-cycles/close?action=won|lost
export async function POST(req: Request) {
  try {
    const { supabase } = await getAuthedSupabase()

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action') // 'won' ou 'lost'

    if (!action || !['won', 'lost'].includes(action)) {
      return NextResponse.json(
        { error: 'action deve ser "won" ou "lost".' },
        { status: 400 }
      )
    }

    if (action === 'won') {
      const body = (await req.json()) as CloseCycleWonRequest

      if (!body.cycle_id) {
        return NextResponse.json({ error: 'cycle_id é obrigatório.' }, { status: 400 })
      }

      const { data, error } = await supabase.rpc('rpc_close_cycle_won', {
        p_cycle_id: body.cycle_id,
        p_won_value: body.won_value || null,
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      const result = Array.isArray(data) ? data[0] : data

      if (result?.error_message) {
        return NextResponse.json({ error: result.error_message }, { status: 403 })
      }

      return NextResponse.json({ ok: true, data: result })
    } else {
      // lost
      const body = (await req.json()) as CloseCycleLostRequest

      if (!body.cycle_id) {
        return NextResponse.json({ error: 'cycle_id é obrigatório.' }, { status: 400 })
      }

      const { data, error } = await supabase.rpc('rpc_close_cycle_lost', {
        p_cycle_id: body.cycle_id,
        p_loss_reason: body.loss_reason || null,
      })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }

      const result = Array.isArray(data) ? data[0] : data

      if (result?.error_message) {
        return NextResponse.json({ error: result.error_message }, { status: 403 })
      }

      return NextResponse.json({ ok: true, data: result })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro desconhecido.' }, { status: 500 })
  }
}