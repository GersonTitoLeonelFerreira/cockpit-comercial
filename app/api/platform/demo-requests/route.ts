import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { ensurePlatformAdmin } from '@/app/lib/supabase/server'

const ALLOWED_STATUS = new Set([
  'new',
  'contacted',
  'qualified',
  'demo_scheduled',
  'closed',
  'lost',
])

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Env NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY ausente.')
  }

  return createClient(url, serviceKey)
}

export async function GET() {
  try {
    await ensurePlatformAdmin()
    const admin = getServiceClient()

    const { data, error } = await admin
      .from('demo_requests')
      .select('id, created_at, name, company, whatsapp, email, segment, message, status')
      .order('created_at', { ascending: false })
      .limit(300)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({
      ok: true,
      rows: (data ?? []).map((row) => ({
        ...row,
        status: row.status || 'new',
      })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 403 })
  }
}

export async function PATCH(req: Request) {
  try {
    await ensurePlatformAdmin()
    const admin = getServiceClient()
    const body = await req.json().catch(() => ({} as any))

    const id = (body?.id || '').trim()
    const status = (body?.status || '').trim()

    if (!id) {
      return NextResponse.json({ error: 'ID é obrigatório.' }, { status: 400 })
    }

    if (!ALLOWED_STATUS.has(status)) {
      return NextResponse.json({ error: 'Status inválido.' }, { status: 400 })
    }

    const { data, error } = await admin
      .from('demo_requests')
      .update({ status })
      .eq('id', id)
      .select('id, status')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, row: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Erro inesperado' }, { status: 403 })
  }
}