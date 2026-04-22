import { NextResponse } from 'next/server'
import { getAuthedSupabase } from '@/app/lib/supabase/server'

type SearchRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
  document: string | null
  stage_entered_at?: string | null
}

function onlyDigits(v: string) {
  return (v || '').replace(/\D/g, '')
}

function sanitizeTerm(v: string) {
  return String(v || '')
    .trim()
    .replace(/[%(),']/g, ' ')
    .replace(/\s+/g, ' ')
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url)
    const rawQuery = (url.searchParams.get('q') ?? '').trim()

    if (!rawQuery) {
      return NextResponse.json({ leads: [] })
    }

    let supabase, user
    try {
      ;({ supabase, user } = await getAuthedSupabase())
    } catch {
      return NextResponse.json({ leads: [] }, { status: 401 })
    }

    const { data: actorProfile, error: actorErr } = await supabase
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .maybeSingle()

    if (actorErr || !actorProfile?.company_id) {
      return NextResponse.json({ leads: [] }, { status: 400 })
    }

    const companyId = actorProfile.company_id
    const digits = onlyDigits(rawQuery)
    const safeText = sanitizeTerm(rawQuery)

    let query = supabase
      .from('v_pipeline_items')
      .select('id, name, phone, email, document, stage_entered_at')
      .eq('company_id', companyId)
      .order('stage_entered_at', { ascending: false })
      .limit(8)

    if (digits.length >= 6) {
      query = query.or(`document.ilike.%${digits}%,phone.ilike.%${digits}%`)
    } else if (safeText.includes('@')) {
      query = query.or(`email.ilike.%${safeText}%,name.ilike.%${safeText}%`)
    } else {
      query = query.or(`name.ilike.%${safeText}%,email.ilike.%${safeText}%`)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ leads: [] }, { status: 400 })
    }

    const leads = ((data ?? []) as SearchRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
    }))

    return NextResponse.json({ leads })
  } catch (e: any) {
    return NextResponse.json(
      { leads: [], error: e?.message || 'Erro inesperado' },
      { status: 500 },
    )
  }
}