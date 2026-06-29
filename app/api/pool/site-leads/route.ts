import { NextResponse } from 'next/server'

import { requireActiveCompanyAdmin } from '@/app/lib/server/require-active-company-admin'

type SiteLeadRow = {
  id: string
  lead_id: string
  name: string
  phone: string | null
  email: string | null
  status: string
  source: string | null
  entry_mode: string
  lead_origin_at: string | null
  created_at: string
}

function parsePositiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) return fallback

  return Math.min(parsed, max)
}

export async function GET(req: Request) {
  const context = await requireActiveCompanyAdmin()

  if (!context.ok) {
    return NextResponse.json({ ok: false, error: context.error }, { status: context.status })
  }

  const requestUrl = new URL(req.url)
  const page = parsePositiveInt(requestUrl.searchParams.get('page'), 1, 10000)
  const pageSize = parsePositiveInt(requestUrl.searchParams.get('page_size'), 30, 100)
  const offset = (page - 1) * pageSize

  const { count, error: countError } = await context.admin
    .from('v_pipeline_items')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', context.companyId)
    .eq('entry_mode', 'import_api')
    .is('owner_id', null)

  if (countError) {
    return NextResponse.json({ ok: false, error: countError.message }, { status: 400 })
  }

  const { data, error } = await context.admin
    .from('v_pipeline_items')
    .select('id, lead_id, name, phone, email, status, source, entry_mode, lead_origin_at, created_at')
    .eq('company_id', context.companyId)
    .eq('entry_mode', 'import_api')
    .is('owner_id', null)
    .order('lead_origin_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }

  const total = count ?? 0

  return NextResponse.json({
    ok: true,
    items: (data ?? []) as SiteLeadRow[],
    total,
    hasMore: offset + pageSize < total,
  })
}
