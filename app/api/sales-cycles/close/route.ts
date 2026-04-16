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

export async function POST(req: Request) {
  try {
    const { supabase } = await getAuthedSupabase()

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

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
        p_won_value: body.won_value ?? null,
        p_revenue_date_ref: body.revenue_date_ref ?? null,
        p_won_note: body.won_note ?? null,
        p_product_id: body.product_id ?? null,
        p_won_unit_price: body.won_unit_price ?? null,
        p_payment_method: body.payment_method ?? null,
        p_payment_type: body.payment_type ?? null,
        p_entry_amount: body.entry_amount ?? null,
        p_installments_count: body.installments_count ?? null,
        p_installment_amount: body.installment_amount ?? null,
        p_payment_notes: body.payment_notes ?? null,
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
    }

    const body = (await req.json()) as CloseCycleLostRequest

    if (!body.cycle_id) {
      return NextResponse.json({ error: 'cycle_id é obrigatório.' }, { status: 400 })
    }

    const { data, error } = await supabase.rpc('rpc_close_cycle_lost', {
      p_cycle_id: body.cycle_id,
      p_lost_reason: body.lost_reason ?? null,
      p_note: body.note ?? null,
      p_action_channel: body.action_channel ?? null,
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
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro desconhecido.' }, { status: 500 })
  }
}