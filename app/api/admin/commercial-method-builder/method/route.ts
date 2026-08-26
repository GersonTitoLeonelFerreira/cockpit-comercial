import { NextResponse } from 'next/server'

import {
  CommercialMethodConstructionValidationError,
  getCommercialMethodConstruction,
  saveCommercialMethodConstruction,
  startCommercialMethodConstruction,
} from '@/app/lib/server/commercial-method-construction'
import {
  parseCommercialMethodConstructionDraft,
} from '@/app/lib/commercial-config/assisted-method-construction'
import {
  isCommercialBuyerDecisionDraft,
} from '@/app/lib/commercial-config/buyer-decision-architecture'
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
    const construction = await getCommercialMethodConstruction(
      context.supabase,
      context.companyId,
    )

    return NextResponse.json({ ok: true, construction })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(error, 'Erro ao carregar a construção do método.'),
      },
      { status: 500 },
    )
  }
}

export async function POST() {
  const context = await requireCommercialConfigAdmin()

  if (!context.ok) {
    return NextResponse.json(
      { ok: false, error: context.error },
      { status: context.status },
    )
  }

  try {
    const construction = await startCommercialMethodConstruction(
      context.supabase,
      context.companyId,
      context.userId,
    )

    return NextResponse.json({ ok: true, construction })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(error, 'Erro ao iniciar a construção do método.'),
      },
      { status: 400 },
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

  if (
    !body ||
    typeof body !== 'object' ||
    !('status' in body) ||
    !('construction' in body) ||
    (body.status !== 'editing' && body.status !== 'review_ready')
  ) {
    return NextResponse.json(
      { ok: false, error: 'O estado enviado para a construção do método é inválido.' },
      { status: 400 },
    )
  }

  const construction = parseCommercialMethodConstructionDraft(body.construction)
  if (!construction) {
    return NextResponse.json(
      { ok: false, error: 'O rascunho estruturado do método é inválido.' },
      { status: 400 },
    )
  }

  if (
    construction.buyer_decision !== undefined &&
    !isCommercialBuyerDecisionDraft(construction.buyer_decision)
  ) {
    return NextResponse.json(
      { ok: false, error: 'A arquitetura da decisão do comprador é inválida.' },
      { status: 400 },
    )
  }

  try {
    const saved = await saveCommercialMethodConstruction(
      context.supabase,
      context.companyId,
      context.userId,
      {
        status: body.status,
        construction,
      },
    )

    return NextResponse.json({ ok: true, construction: saved })
  } catch (error: unknown) {
    if (error instanceof CommercialMethodConstructionValidationError) {
      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          issues: error.issues,
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(error, 'Erro ao salvar a construção do método.'),
      },
      { status: 400 },
    )
  }
}
