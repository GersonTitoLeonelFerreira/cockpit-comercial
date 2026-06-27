import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type {
  AICoaching,
  AICoachingHistoryItem,
  AICoachingHistoryResponse,
} from '@/app/types/ai-coaching'

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

function sanitizeHistoryItem(
  value: unknown
): AICoachingHistoryItem | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const item = value as Record<string, unknown>

  if (
    typeof item.id !== 'string' ||
    typeof item.created_at !== 'string' ||
    typeof item.source !== 'string' ||
    !isAICoaching(item.coaching)
  ) {
    return null
  }

  return {
    id: item.id,
    created_at: item.created_at,
    source: item.source,
    coaching: item.coaching,
    yolen_decision:
      item.yolen_decision &&
      typeof item.yolen_decision === 'object' &&
      !Array.isArray(item.yolen_decision)
        ? (item.yolen_decision as Record<string, unknown>)
        : {},
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)

    const cycleId = url.searchParams.get('cycle_id')

    if (!cycleId) {
      return NextResponse.json<AICoachingHistoryResponse>(
        {
          ok: false,
          error: 'cycle_id é obrigatório.',
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
      return NextResponse.json<AICoachingHistoryResponse>(
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
      return NextResponse.json<AICoachingHistoryResponse>(
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
      'rpc_list_ai_coaching_for_cycle_for_company',
      {
        p_company_id: activeCompanyId,
        p_cycle_id: cycleId,
        p_limit: 10,
      }
    )

    if (error) {
      return NextResponse.json<AICoachingHistoryResponse>(
        {
          ok: false,
          error:
            error.message ||
            'Erro ao buscar orientações salvas.',
        },
        {
          status: 400,
        }
      )
    }

    const result = Array.isArray(data) ? data[0] : data

    if (!result?.success) {
      return NextResponse.json<AICoachingHistoryResponse>(
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

    const rawItems: unknown[] = Array.isArray(result.items)
      ? (result.items as unknown[])
      : []

    const items = rawItems
      .map(sanitizeHistoryItem)
      .filter(
        (
          item
        ): item is AICoachingHistoryItem => Boolean(item)
      )

    return NextResponse.json<AICoachingHistoryResponse>({
      ok: true,
      data: {
        items,
      },
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro desconhecido ao buscar orientações.'

    return NextResponse.json<AICoachingHistoryResponse>(
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