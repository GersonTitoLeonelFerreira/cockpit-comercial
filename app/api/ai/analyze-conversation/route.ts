import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { analyzeConversationWithCopilot } from '@/app/lib/ai/sales-copilot'
import type {
  AnalyzeConversationRequest,
  AnalyzeConversationResponse,
  AISalesContext,
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

    const { data: cycleRow, error: cycleError } = await supabase
      .from('sales_cycles')
      .select(`
        id,
        company_id,
        lead_id,
        owner_user_id,
        status,
        next_action,
        next_action_date,
        current_group_id,
        leads:lead_id (
          name,
          phone,
          email
        )
      `)
      .eq('id', body.cycle_id)
      .single()

    if (cycleError || !cycleRow) {
      return NextResponse.json<AnalyzeConversationResponse>(
        { ok: false, error: 'Ciclo não encontrado ou sem permissão.' },
        { status: 404 }
      )
    }

    const lead = Array.isArray((cycleRow as any).leads)
      ? (cycleRow as any).leads[0]
      : (cycleRow as any).leads

    const context: AISalesContext = {
      cycle_id: cycleRow.id,
      current_status: cycleRow.status,
      lead_name: lead?.name ?? null,
      lead_phone: lead?.phone ?? null,
      lead_email: lead?.email ?? null,
      owner_user_id: cycleRow.owner_user_id ?? null,
      current_next_action: cycleRow.next_action ?? null,
      current_next_action_date: cycleRow.next_action_date ?? null,
      current_group_id: cycleRow.current_group_id ?? null,
    }

    const suggestion = await analyzeConversationWithCopilot({
      context,
      conversationText: body.conversation_text,
      source: body.source ?? 'notes',
    })

    return NextResponse.json<AnalyzeConversationResponse>({
      ok: true,
      data: {
        context,
        suggestion,
      },
    })
  } catch (e: any) {
    return NextResponse.json<AnalyzeConversationResponse>(
      { ok: false, error: e?.message || 'Erro desconhecido.' },
      { status: 500 }
    )
  }
}