import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type PlatformStatus = 'active' | 'blocked'

type StatusResult = {
  success?: boolean
  error?: string
  platform_status?: PlatformStatus
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !anonKey) {
      return NextResponse.json(
        {
          error:
            'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou NEXT_PUBLIC_SUPABASE_ANON_KEY',
        },
        { status: 500 },
      )
    }

    const cookieStore = await cookies()

    const supabase = createServerClient(url, anonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {
          // API route sem renovação de cookie.
        },
      },
    })

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Não autenticado.' },
        { status: 401 },
      )
    }

    const body = (await request.json().catch(() => null)) as {
      platform_status?: unknown
    } | null

    const nextStatus = body?.platform_status

    if (nextStatus !== 'active' && nextStatus !== 'blocked') {
      return NextResponse.json(
        { error: 'Status de empresa inválido.' },
        { status: 400 },
      )
    }

    const { id: companyId } = await context.params

    const { data, error } = await supabase.rpc(
      'rpc_platform_set_company_status',
      {
        p_company_id: companyId,
        p_platform_status: nextStatus,
      },
    )

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      )
    }

    const result = (data ?? {}) as StatusResult

    if (result.success !== true) {
      return NextResponse.json(
        {
          error:
            result.error ||
            'Não foi possível alterar o status da empresa.',
        },
        { status: 403 },
      )
    }

    return NextResponse.json({
      ok: true,
      platform_status: result.platform_status ?? nextStatus,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erro inesperado ao alterar status da empresa.',
      },
      { status: 500 },
    )
  }
}