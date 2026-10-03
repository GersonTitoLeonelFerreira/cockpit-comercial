import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { analyzeConversationWithCopilotDetailed } from '@/app/lib/ai/sales-copilot'
import {
  isFullReadingEnabledForUser,
  isLegacyCompanionAiDisabled,
  logLegacyAiSkipped,
} from '@/app/lib/server/full-reading-flag'
import type {
  AnalyzeConversationRequest,
  AnalyzeConversationResponse,
  AISalesContext,
  AISalesRecentEvent,
} from '@/app/types/ai-sales'

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

// Rodada 10 (F2): com a leitura completa ligada (HML), o Copiloto da página
// do lead não gera outra análise paga: a análise vem da leitura do
// Companion. A rota responde sem chamar a IA. Desligada, nada muda.
const COPILOT_ANALYSIS_FROM_COMPANION_MESSAGE =
  'Na homologação, a análise desta conversa vem da leitura do Companion.'

export async function POST(req: Request) {
  if (isLegacyCompanionAiDisabled()) {
    logLegacyAiSkipped('/api/ai/analyze-conversation')

    return NextResponse.json<AnalyzeConversationResponse>(
      { ok: false, error: COPILOT_ANALYSIS_FROM_COMPANION_MESSAGE },
      { status: 409 }
    )
  }

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

    const { supabase, user, activeCompanyId } = await getAuthedSupabase()

    // Rodada 17: o mesmo 409 por usuário da sessão (o mesmo da página do
    // lead), antes de qualquer RPC ou chamada a modelo. Preview: a trava
    // global acima já respondeu; produção: só quem está na lista.
    if (isFullReadingEnabledForUser({ userId: user?.id })) {
      logLegacyAiSkipped('/api/ai/analyze-conversation')

      return NextResponse.json<AnalyzeConversationResponse>(
        { ok: false, error: COPILOT_ANALYSIS_FROM_COMPANION_MESSAGE },
        { status: 409 }
      )
    }

    if (!activeCompanyId) {
      return NextResponse.json<AnalyzeConversationResponse>(
        { ok: false, error: 'Empresa ativa não selecionada.' },
        { status: 400 }
      )
    }

    const { data, error } = await supabase.rpc('rpc_get_cycle_ai_context_for_company', {
      p_company_id: activeCompanyId,
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido.'

    return NextResponse.json<AnalyzeConversationResponse>(
      { ok: false, error: message },
      { status: 500 }
    )
  }
}