import { NextResponse } from 'next/server'

import { requireActiveCompanyAdmin } from '@/app/lib/server/require-active-company-admin'

export const runtime = 'nodejs'

type CreateApiKeyBody = {
  name?: unknown
}

type RevokeApiKeyBody = {
  id?: unknown
}

type ApiKeyRow = {
  id: string
  name: string
  key_prefix: string
  secret_hash: string
  company_id: string
  created_by: string
  created_at: string
  last_used_at: string | null
  revoked_at: string | null
  revoked_by: string | null
}

type ApiKeysTableClient = {
  from: (table: 'company_lead_api_keys') => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        order: (column: string, options: { ascending: boolean; nullsFirst?: boolean }) => {
          order: (column: string, options: { ascending: boolean }) => Promise<{ data: ApiKeyRow[] | null; error: { message: string } | null }>
        }
      }
    }
    insert: (values: Pick<ApiKeyRow, 'company_id' | 'name' | 'key_prefix' | 'secret_hash' | 'created_by'>) => {
      select: (columns: string) => {
        single: () => Promise<{ data: ApiKeyRow | null; error: { message: string } | null }>
      }
    }
    update: (values: Pick<ApiKeyRow, 'revoked_at' | 'revoked_by'>) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          is: (column: string, value: null) => {
            select: (columns: string) => {
              maybeSingle: () => Promise<{ data: Pick<ApiKeyRow, 'id'> | null; error: { message: string } | null }>
            }
          }
        }
      }
    }
  }
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').trim()
  return text || null
}

async function hashSecret(secret: string): Promise<string> {
  const bytes = new TextEncoder().encode(secret)
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function createSecret(): string {
  return `yln_live_${crypto.randomUUID().replaceAll('-', '')}${crypto.randomUUID().replaceAll('-', '')}`
}

export async function GET() {
  const context = await requireActiveCompanyAdmin()

  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status })
  }

  const admin = context.admin as unknown as ApiKeysTableClient
  const { data, error } = await admin
    .from('company_lead_api_keys')
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .eq('company_id', context.companyId)
    .order('revoked_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, keys: data ?? [] })
}

export async function POST(req: Request) {
  const context = await requireActiveCompanyAdmin()

  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status })
  }

  const body = (await req.json().catch(() => ({}))) as CreateApiKeyBody
  const name = cleanText(body.name)

  if (!name || name.length < 2 || name.length > 80) {
    return NextResponse.json(
      { ok: false, error: 'Informe um nome entre 2 e 80 caracteres para identificar o site.' },
      { status: 400 },
    )
  }

  const apiKey = createSecret()
  const keyPrefix = apiKey.slice(0, 18)
  const admin = context.admin as unknown as ApiKeysTableClient
  const { data, error } = await admin
    .from('company_lead_api_keys')
    .insert({
      company_id: context.companyId,
      name,
      key_prefix: keyPrefix,
      secret_hash: await hashSecret(apiKey),
      created_by: context.userId,
    })
    .select('id, name, key_prefix, created_at, last_used_at, revoked_at')
    .single()

  if (error) {
    const isDuplicateName = error.message.toLowerCase().includes('company_lead_api_keys_company_active_name_uniq')

    return NextResponse.json(
      {
        ok: false,
        error: isDuplicateName
          ? 'Já existe uma chave ativa com esse nome nesta empresa.'
          : error.message,
      },
      { status: 400 },
    )
  }

  return NextResponse.json({
    ok: true,
    key: data,
    api_key: apiKey,
    warning: 'Esta é a única vez em que a chave completa será exibida.',
  })
}

export async function DELETE(req: Request) {
  const context = await requireActiveCompanyAdmin()

  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status })
  }

  const body = (await req.json().catch(() => ({}))) as RevokeApiKeyBody
  const keyId = cleanText(body.id)

  if (!keyId) {
    return NextResponse.json({ ok: false, error: 'Chave de integração inválida.' }, { status: 400 })
  }

  const admin = context.admin as unknown as ApiKeysTableClient
  const { data, error } = await admin
    .from('company_lead_api_keys')
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: context.userId,
    })
    .eq('id', keyId)
    .eq('company_id', context.companyId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }

  if (!data?.id) {
    return NextResponse.json({ ok: false, error: 'Chave não encontrada ou já revogada.' }, { status: 404 })
  }

  return NextResponse.json({ ok: true })
}
