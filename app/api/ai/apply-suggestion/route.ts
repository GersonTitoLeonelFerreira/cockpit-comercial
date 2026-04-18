import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type {
  ApplyAISuggestionRequest,
  ApplyAISuggestionResponse,
} from '@/app/types/ai-sales'
import type { LeadStatus } from '@/app/types/sales_cycles'

const OPEN_APPLY_STATUSES: LeadStatus[] = ['novo', 'contato', 'respondeu', 'negociacao', 'pausado']

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
    const body = (await req.json()) as ApplyAISuggestionRequest

    if (!body.cycle_id || typeof body.cycle_id !== 'string') {
      return NextResponse.json<ApplyAISuggestionResponse>(
        { ok: false, error: 'cycle_id é obrigatório.' },
        { status: 400 }
      )
    }

    if (!body.suggestion || typeof body.suggestion !== 'object') {
      return NextResponse.json<ApplyAISuggestionResponse>(
        { ok: false, error: 'suggestion é obrigatório.' },
        { status: 400 }
      )
    }

    if (!body.applied_status || !OPEN_APPLY_STATUSES.includes(body.applied_status)) {
      return NextResponse.json<ApplyAISuggestionResponse>(
        { ok: false, error: 'applied_status deve ser um estágio aberto válido.' },
        { status: 400 }
      )
    }

    let nextActionDate: string | null = null

    if (body.next_action_date) {
      const parsed = new Date(body.next_action_date)

      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json<ApplyAISuggestionResponse>(
          { ok: false, error: 'next_action_date inválida.' },
          { status: 400 }
        )
      }

      nextActionDate = parsed.toISOString()
    }

    const { supabase } = await getAuthedSupabase()

    const { data, error } = await supabase.rpc('rpc_apply_ai_open_suggestion', {
      p_cycle_id: body.cycle_id,
      p_to_status: body.applied_status,
      p_next_action: body.next_action ?? null,
      p_next_action_date: nextActionDate,
      p_summary: body.edited_summary ?? null,
      p_suggestion: body.suggestion,
      p_source: body.source ?? 'ai_copilot_detail',
    })

    if (error) {
      return NextResponse.json<ApplyAISuggestionResponse>(
        { ok: false, error: error.message || 'Erro ao aplicar sugestão da IA.' },
        { status: 400 }
      )
    }

    const result = Array.isArray(data) ? data[0] : data

    if (!result?.success) {
      return NextResponse.json<ApplyAISuggestionResponse>(
        { ok: false, error: result?.error || result?.error_message || 'Operação não confirmada.' },
        { status: 403 }
      )
    }

    return NextResponse.json<ApplyAISuggestionResponse>({
      ok: true,
      data: {
        id: result.id,
        status: result.status,
        previous_status: result.previous_status ?? null,
        next_action: result.next_action ?? null,
        next_action_date: result.next_action_date ?? null,
      },
    })
  } catch (e: any) {
    return NextResponse.json<ApplyAISuggestionResponse>(
      { ok: false, error: e?.message || 'Erro desconhecido.' },
      { status: 500 }
    )
  }
}