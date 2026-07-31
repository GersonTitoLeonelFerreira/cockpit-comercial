import { NextResponse } from 'next/server'

import {
  getCommercialConfigWorkspace,
  saveCommercialConfigDraft,
} from '@/app/lib/server/commercial-config'
import { requireCommercialConfigAdmin } from '@/app/lib/server/require-commercial-config-admin'
import type { CommercialConfigDraftInput } from '@/app/types/commercial-config'

export const dynamic = 'force-dynamic'

const ROOT_STRING_FIELDS = [
  'business_description',
  'target_audience',
  'value_proposition',
  'commercial_method_name',
  'commercial_method_description',
  'communication_tone',
] as const

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  )
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === 'string')
  )
}

function isObjectArray(
  value: unknown,
): value is Record<string, unknown>[] {
  return (
    Array.isArray(value) &&
    value.every((item) => isRecord(item))
  )
}

function parseDraftInput(
  value: unknown,
): CommercialConfigDraftInput | null {
  if (!isRecord(value)) {
    return null
  }

  const configVersionId = value.config_version_id

  if (
    configVersionId !== undefined &&
    configVersionId !== null &&
    typeof configVersionId !== 'string'
  ) {
    return null
  }

  const hasValidRootStrings = ROOT_STRING_FIELDS.every(
    (field) => typeof value[field] === 'string',
  )

  if (!hasValidRootStrings) {
    return null
  }

  if (!isStringArray(value.required_behaviors)) {
    return null
  }

  if (!isStringArray(value.prohibited_behaviors)) {
    return null
  }

  if (!isObjectArray(value.method_steps)) {
    return null
  }

  if (!isObjectArray(value.product_profiles)) {
    return null
  }

  if (!isObjectArray(value.facts)) {
    return null
  }

  if (!isObjectArray(value.objection_guides)) {
    return null
  }

  return value as unknown as CommercialConfigDraftInput
}

function errorMessage(
  error: unknown,
  fallback: string,
): string {
  return error instanceof Error ? error.message : fallback
}

export async function GET() {
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

  try {
    const workspace = await getCommercialConfigWorkspace(
      context.supabase,
      context.companyId,
    )

    return NextResponse.json({
      ok: true,
      workspace,
    })
  } catch (error: unknown) {
    return NextResponse.json(
      {
        ok: false,
        error: errorMessage(
          error,
          'Erro ao carregar a configuração comercial.',
        ),
      },
      {
        status: 500,
      },
    )
  }
}

export async function PUT(request: Request) {
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

  const body = await request.json().catch(() => null)
  const input = parseDraftInput(body)

  if (!input) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'O conteúdo enviado para a configuração comercial é inválido.',
      },
      {
        status: 400,
      },
    )
  }

  try {
    const result = await saveCommercialConfigDraft(
      context.supabase,
      context.companyId,
      input,
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
          'Erro ao salvar a configuração comercial.',
        ),
      },
      {
        status: 400,
      },
    )
  }
}