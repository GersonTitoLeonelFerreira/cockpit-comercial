import { NextResponse } from 'next/server'

import {
  CommercialMethodBuilderStaleWriteError,
  getCommercialMethodBuilderDraft,
  saveCommercialMethodBuilderDraft,
} from '@/app/lib/server/commercial-method-builder'
import { parseCommercialMethodBuilderDraftInput } from '@/app/lib/commercial-config/commercial-method-builder'
import { requireCommercialConfigAdmin } from '@/app/lib/server/require-commercial-config-admin'

export const dynamic = 'force-dynamic'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export async function GET() {
  const context = await requireCommercialConfigAdmin()

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    )
  }

  try {
    const draft = await getCommercialMethodBuilderDraft(
      context.supabase,
      context.companyId,
    )

    return NextResponse.json({
      ok: true,
      draft,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(
          error,
          'Erro ao carregar o construtor assistido.',
        ),
      },
      { status: 500 },
    )
  }
}

export async function PUT(request: Request) {
  const context = await requireCommercialConfigAdmin()

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    )
  }

  const body = await request.json().catch(() => null)
  const input = parseCommercialMethodBuilderDraftInput(body)

  if (!input) {
    return NextResponse.json(
      {
        ok: false,
        error: 'O rascunho do construtor assistido é inválido.',
      },
      { status: 400 },
    )
  }

  try {
    const draft = await saveCommercialMethodBuilderDraft(
      context.supabase,
      context.companyId,
      context.userId,
      input,
      request.headers.get('x-yolen-builder-updated-at'),
    )

    return NextResponse.json({
      ok: true,
      draft,
    })
  } catch (error: unknown) {
    if (error instanceof CommercialMethodBuilderStaleWriteError) {
      return NextResponse.json(
        {
          ok: false,
          code: 'STALE_BUILDER_DRAFT',
          error: error.message,
        },
        { status: 409 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(
          error,
          'Erro ao salvar o construtor assistido.',
        ),
      },
      { status: 400 },
    )
  }
}
