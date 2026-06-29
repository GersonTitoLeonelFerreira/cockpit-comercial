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
  owner_id: string | null
}

type AssignedTo = {
  id: string
  name: string
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

  if (countError) {
    return NextResponse.json({ ok: false, error: countError.message }, { status: 400 })
  }

  const { count: waitingCount, error: waitingCountError } = await context.admin
    .from('v_pipeline_items')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', context.companyId)
    .eq('entry_mode', 'import_api')
    .is('owner_id', null)

  if (waitingCountError) {
    return NextResponse.json({ ok: false, error: waitingCountError.message }, { status: 400 })
  }

  const { data, error } = await context.admin
    .from('v_pipeline_items')
    .select('id, lead_id, name, phone, email, status, source, entry_mode, lead_origin_at, created_at, owner_id')
    .eq('company_id', context.companyId)
    .eq('entry_mode', 'import_api')
    .order('lead_origin_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(offset, offset + pageSize - 1)

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }

  const items = (data ?? []) as SiteLeadRow[]
  const ownerIds = Array.from(new Set(items.map((item) => item.owner_id).filter((id): id is string => Boolean(id))))
  const assignedToByOwnerId = new Map<string, AssignedTo>()

  if (ownerIds.length > 0) {
    const { data: profiles, error: profilesError } = await context.admin
      .from('profiles')
      .select('id, full_name, email')
      .in('id', ownerIds)

    if (profilesError) {
      return NextResponse.json({ ok: false, error: profilesError.message }, { status: 400 })
    }

    for (const profile of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      assignedToByOwnerId.set(profile.id, {
        id: profile.id,
        name: profile.full_name ?? profile.email ?? 'Vendedor sem nome',
      })
    }
  }

  const total = count ?? 0

  return NextResponse.json({
    ok: true,
    items: items.map((item) => ({
      ...item,
      assigned_to: item.owner_id ? assignedToByOwnerId.get(item.owner_id) ?? null : null,
    })),
    total,
    waiting_count: waitingCount ?? 0,
    hasMore: offset + pageSize < total,
  })
}
