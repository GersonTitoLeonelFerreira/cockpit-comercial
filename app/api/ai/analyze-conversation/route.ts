import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { analyzeConversationWithCopilotDetailed } from '@/app/lib/ai/sales-copilot'
import type {
  AnalyzeConversationRequest,
  AnalyzeConversationResponse,
  AISalesContext,
  AISalesRecentEvent,
} from '@/app/types/ai-sales'

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
    const body = (await req.json()) as AnalyzeConversationRequest

    if (!body.cycle_id || typeof body.cycle_id !== 'string') {
      return NextResponse.json<AnalyzeConversationResponse>(
        { ok: false, error: 'cycle_id é obrigatório.' },
        { status: 400 }
      )
    }

    if (!body.conversation_text || !body.conversation_text.trim()) {
      return NextResponse.json<AnalyzeConversationResponse>(
        { ok: false, error: 'conversation_text é obrigatório.' },
        { status: 400 }
      )
    }

    const { supabase } = await getAuthedSupabase()

    const { data, error } = await supabase.rpc('rpc_get_cycle_ai_context', {
      p_cycle_id: body.cycle_id,
      p_events_limit: 12,
    })

    if (error) {
      return NextResponse.json<AnalyzeConversationResponse>(
        { ok: false, error: error.message || 'Erro ao montar contexto da IA.' },
        { status: 400 }
      )
    }

    const rpcResult = Array.isArray(data) ? data[0] : data

    if (!rpcResult?.success || !rpcResult?.cycle || !rpcResult?.lead) {
      return NextResponse.json<AnalyzeConversationResponse>(
        { ok: false, error: rpcResult?.error || 'Ciclo não encontrado ou sem permissão.' },
        { status: 404 }
      )
    }

    const context: AISalesContext = {
      cycle_id: rpcResult.cycle.id,
      current_status: rpcResult.cycle.status,
      lead_name: rpcResult.lead.name ?? null,
      lead_phone: rpcResult.lead.phone ?? null,
      lead_email: rpcResult.lead.email ?? null,
      owner_user_id: rpcResult.cycle.owner_user_id ?? null,
      current_next_action: rpcResult.cycle.next_action ?? null,
      current_next_action_date: rpcResult.cycle.next_action_date ?? null,
      current_group_id: rpcResult.cycle.current_group_id ?? null,
      current_group_name: rpcResult.cycle.current_group_name ?? null,
      recent_events: Array.isArray(rpcResult.recent_events)
        ? (rpcResult.recent_events as AISalesRecentEvent[])
        : [],
    }

    const result = await analyzeConversationWithCopilotDetailed({
      context,
      conversationText: body.conversation_text,
      source: body.source ?? 'notes',
    })

    return NextResponse.json<AnalyzeConversationResponse>({
      ok: true,
      data: {
        context,
        suggestion: result.suggestion,
        diagnostics: result.diagnostics,
      },
    })
  } catch (e: any) {
    return NextResponse.json<AnalyzeConversationResponse>(
      { ok: false, error: e?.message || 'Erro desconhecido.' },
      { status: 500 }
    )
  }
}