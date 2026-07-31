import { NextResponse } from 'next/server'

import { cloneCommercialConfigVersion } from '@/app/lib/server/commercial-config'
import { requireCommercialConfigAdmin } from '@/app/lib/server/require-commercial-config-admin'

type CloneCommercialConfigBody = {
  source_config_version_id?: unknown
}

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const text = value.trim()

  return text || null
}

function errorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error ? error.message : fallback
}

export async function POST(request: Request) {
  const context = await requireCommercialConfigAdmin()

  if (!context.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: context.error,
      },
      {
        status: context.status,
      },
    )
  }

  const body = (await request.json().catch(() => null)) as
    | CloneCommercialConfigBody
    | null

  const sourceConfigVersionId = cleanId(
    body?.source_config_version_id,
  )

  if (!sourceConfigVersionId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'A versão comercial de origem é obrigatória.',
      },
      {
        status: 400,
      },
    )
  }

  try {
    const result = await cloneCommercialConfigVersion(
      context.supabase,
      context.companyId,
      sourceConfigVersionId,
    )

    return NextResponse.json({
      ok: true,
      result,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(
          error,
          'Erro ao clonar a configuração comercial.',
        ),
      },
      {
        status: 400,
      },
    )
  }
}