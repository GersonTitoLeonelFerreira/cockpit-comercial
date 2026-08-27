import { NextResponse } from 'next/server'

import {
  CommercialMethodPublishError,
  publishBuilderCommercialMethod,
} from '@/app/lib/server/commercial-method-publish'
import { requireCommercialConfigAdmin } from '@/app/lib/server/require-commercial-config-admin'

export const dynamic = 'force-dynamic'

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
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
    const result = await publishBuilderCommercialMethod(
      context.supabase,
      context.companyId,
    )

    return NextResponse.json({ ok: true, result })
  } catch (error: unknown) {
    if (error instanceof CommercialMethodPublishError) {
      return NextResponse.json(
        {
          ok: false,
          code: error.code,
          error: error.message,
          issues: error.issues,
        },
        { status: 400 },
      )
    }

    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(error, 'Erro ao publicar o método comercial.'),
      },
      { status: 500 },
    )
  }
}
