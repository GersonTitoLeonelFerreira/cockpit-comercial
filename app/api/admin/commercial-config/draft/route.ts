import { NextResponse } from 'next/server'

import { deleteCommercialConfigDraft } from '@/app/lib/server/commercial-config'
import { requireCommercialConfigAdmin } from '@/app/lib/server/require-commercial-config-admin'

type DeleteCommercialConfigBody = {
  config_version_id?: unknown
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

export async function DELETE(request: Request) {
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
    | DeleteCommercialConfigBody
    | null

  const configVersionId = cleanId(
    body?.config_version_id,
  )

  if (!configVersionId) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'O rascunho comercial que será excluído é obrigatório.',
      },
      {
        status: 400,
      },
    )
  }

  try {
    const result = await deleteCommercialConfigDraft(
      context.supabase,
      context.companyId,
      configVersionId,
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
          'Erro ao excluir o rascunho comercial.',
        ),
      },
      {
        status: 400,
      },
    )
  }
}