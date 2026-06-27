import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { AICoaching } from '@/app/types/ai-coaching'
import type {
  SaveAICoachingRequest,
  SaveAICoachingResponse,
} from '@/app/types/ai-coaching'
import type { AISalesSuggestion } from '@/app/types/ai-sales'

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string')
  )
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isAICoaching(value: unknown): value is AICoaching {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const coaching = value as Record<string, unknown>

  return (
    typeof coaching.conversation_summary === 'string' &&
    coaching.conversation_summary.trim().length > 0 &&
    isStringArray(coaching.customer_interests) &&
    isStringArray(coaching.objections) &&
    isStringArray(coaching.what_went_well) &&
    isStringArray(coaching.what_to_improve) &&
    isNullableString(coaching.recommended_next_approach) &&
    isNullableString(coaching.suggested_message)
  )
}

function isAISalesSuggestion(
  value: unknown
): value is AISalesSuggestion {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const suggestion = value as Record<string, unknown>

  return (
    typeof suggestion.recommended_status === 'string' &&
    typeof suggestion.summary === 'string' &&
    typeof suggestion.reason_for_recommendation === 'string'
  )
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SaveAICoachingRequest

    if (!body.cycle_id || typeof body.cycle_id !== 'string') {
      return NextResponse.json<SaveAICoachingResponse>(
        {
          ok: false,
          error: 'cycle_id é obrigatório.',
        },
        {
          status: 400,
        }
      )
    }

    if (!isAICoaching(body.coaching)) {
      return NextResponse.json<SaveAICoachingResponse>(
        {
          ok: false,
          error: 'Leitura comercial inválida.',
        },
        {
          status: 400,
        }
      )
    }

    if (!isAISalesSuggestion(body.suggestion)) {
      return NextResponse.json<SaveAICoachingResponse>(
        {
          ok: false,
          error: 'Decisão operacional inválida.',
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
      return NextResponse.json<SaveAICoachingResponse>(
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
      return NextResponse.json<SaveAICoachingResponse>(
        {
          ok: false,
          error: 'Não autenticado.',
        },
        {
          status: 401,
        }
      )
    }

    const yolenDecision = {
      recommended_status: body.suggestion.recommended_status,
      confidence: body.suggestion.confidence,
      action_result: body.suggestion.action_result,
      result_detail: body.suggestion.result_detail,
      next_action: body.suggestion.next_action,
      next_action_date: body.suggestion.next_action_date,
      summary: body.suggestion.summary,
      tags: body.suggestion.tags,
      source: body.suggestion.source,
      reason_for_recommendation:
        body.suggestion.reason_for_recommendation,
    }

    const source =
      body.source === 'ai_copilot_kanban'
        ? 'ai_copilot_kanban'
        : 'ai_copilot_detail'

    const { data, error } = await supabase.rpc(
      'rpc_save_ai_coaching_for_company',
      {
        p_company_id: activeCompanyId,
        p_cycle_id: body.cycle_id,
        p_coaching: body.coaching,
        p_yolen_decision: yolenDecision,
        p_source: source,
      }
    )

    if (error) {
      return NextResponse.json<SaveAICoachingResponse>(
        {
          ok: false,
          error:
            error.message ||
            'Erro ao salvar leitura comercial.',
        },
        {
          status: 400,
        }
      )
    }

    const result = Array.isArray(data) ? data[0] : data

    if (!result?.success) {
      return NextResponse.json<SaveAICoachingResponse>(
        {
          ok: false,
          error:
            result?.error ||
            'Operação não confirmada.',
        },
        {
          status: 403,
        }
      )
    }

    return NextResponse.json<SaveAICoachingResponse>({
      ok: true,
      data: {
        id: result.id,
        occurred_at: result.occurred_at,
      },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido ao salvar leitura comercial.'

    return NextResponse.json<SaveAICoachingResponse>(
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