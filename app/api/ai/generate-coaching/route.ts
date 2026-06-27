import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import { generateSalesCoaching } from '@/app/lib/ai/sales-coaching'
import type {
  AISalesContext,
  AISalesRecentEvent,
  AISalesSuggestion,
  ConversationSource,
} from '@/app/types/ai-sales'
import type { LeadStatus } from '@/app/types/sales_cycles'
import type {
  GenerateAICoachingRequest,
  GenerateAICoachingResponse,
} from '@/app/types/ai-coaching'

function isConversationSource(value: unknown): value is ConversationSource {
  return (
    value === 'whatsapp' ||
    value === 'phone_summary' ||
    value === 'notes'
  )
}

function isLeadStatus(value: unknown): value is LeadStatus {
  return (
    value === 'novo' ||
    value === 'contato' ||
    value === 'respondeu' ||
    value === 'negociacao' ||
    value === 'pausado' ||
    value === 'cancelado' ||
    value === 'ganho' ||
    value === 'perdido'
  )
}

function isAISalesSuggestion(value: unknown): value is AISalesSuggestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const suggestion = value as Record<string, unknown>

  return (
    isLeadStatus(suggestion.recommended_status) &&
    typeof suggestion.summary === 'string' &&
    typeof suggestion.reason_for_recommendation === 'string'
  )
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateAICoachingRequest

    if (!body.cycle_id || typeof body.cycle_id !== 'string') {
      return NextResponse.json<GenerateAICoachingResponse>(
        {
          ok: false,
          error: 'cycle_id é obrigatório.',
        },
        {
          status: 400,
        }
      )
    }

    if (
      !body.conversation_text ||
      typeof body.conversation_text !== 'string' ||
      body.conversation_text.trim().length < 15
    ) {
      return NextResponse.json<GenerateAICoachingResponse>(
        {
          ok: false,
          error: 'conversation_text deve ter pelo menos 15 caracteres.',
        },
        {
          status: 400,
        }
      )
    }

    if (!isConversationSource(body.source)) {
      return NextResponse.json<GenerateAICoachingResponse>(
        {
          ok: false,
          error: 'Origem da conversa inválida.',
        },
        {
          status: 400,
        }
      )
    }

    if (!isAISalesSuggestion(body.suggestion)) {
      return NextResponse.json<GenerateAICoachingResponse>(
        {
          ok: false,
          error: 'Sugestão operacional inválida.',
        },
        {
          status: 400,
        }
      )
    }

    const cookieStore = await cookies()

    const activeCompanyId =
      cookieStore.get('cockpit_active_company_id')?.value ?? null

    if (!activeCompanyId) {
      return NextResponse.json<GenerateAICoachingResponse>(
        {
          ok: false,
          error: 'Empresa ativa não selecionada.',
        },
        {
          status: 400,
        }
      )
    }

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

    const { data: auth, error: authError } =
      await supabase.auth.getUser()

    if (authError || !auth?.user) {
      return NextResponse.json<GenerateAICoachingResponse>(
        {
          ok: false,
          error: 'Não autenticado.',
        },
        {
          status: 401,
        }
      )
    }

    const { data, error } = await supabase.rpc(
      'rpc_get_cycle_ai_context_for_company',
      {
        p_company_id: activeCompanyId,
        p_cycle_id: body.cycle_id,
        p_events_limit: 12,
      }
    )

    if (error) {
      return NextResponse.json<GenerateAICoachingResponse>(
        {
          ok: false,
          error:
            error.message ||
            'Erro ao montar contexto do ciclo.',
        },
        {
          status: 400,
        }
      )
    }

    const rpcResult = Array.isArray(data) ? data[0] : data

    if (
      !rpcResult?.success ||
      !rpcResult?.cycle ||
      !rpcResult?.lead ||
      !isLeadStatus(rpcResult.cycle.status)
    ) {
      return NextResponse.json<GenerateAICoachingResponse>(
        {
          ok: false,
          error:
            rpcResult?.error ||
            'Ciclo não encontrado ou sem permissão.',
        },
        {
          status: 404,
        }
      )
    }

    const context: AISalesContext = {
      cycle_id: rpcResult.cycle.id,
      current_status: rpcResult.cycle.status,
      lead_name: rpcResult.lead.name ?? null,
      owner_user_id: rpcResult.cycle.owner_user_id ?? null,
      current_next_action:
        rpcResult.cycle.next_action ?? null,
      current_next_action_date:
        rpcResult.cycle.next_action_date ?? null,
      current_group_id:
        rpcResult.cycle.current_group_id ?? null,
      current_group_name:
        rpcResult.cycle.current_group_name ?? null,
      recent_events: Array.isArray(rpcResult.recent_events)
        ? (rpcResult.recent_events as AISalesRecentEvent[])
        : [],
    }

    const coaching = await generateSalesCoaching({
      context,
      conversationText: body.conversation_text,
      suggestion: body.suggestion,
    })

    return NextResponse.json<GenerateAICoachingResponse>({
      ok: true,
      data: {
        coaching,
      },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido ao gerar leitura comercial.'

    return NextResponse.json<GenerateAICoachingResponse>(
      {
        ok: false,
        error: message,
      },
      {
        status: 500,
      }
    )
  }
}