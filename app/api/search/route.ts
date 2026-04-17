import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type LeadRow = {
  id: string
  name: string
  phone: string | null
  updated_at?: string | null
}

type CycleRow = {
  id: string
  lead_id: string
  created_at?: string | null
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (!q) return NextResponse.json({ leads: [] })

  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: auth } = await supabase.auth.getUser()
  if (!auth?.user?.id) return NextResponse.json({ leads: [] }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', auth.user.id)
    .single()

  if (!profile?.company_id) return NextResponse.json({ leads: [] })

  const digits = q.replace(/\D/g, '')
  const hasDigits = digits.length >= 6

  let leadQuery = supabase
    .from('leads')
    .select('id,name,phone,updated_at')
    .eq('company_id', profile.company_id)
    .order('updated_at', { ascending: false })
    .limit(12)

  if (hasDigits) {
    leadQuery = leadQuery.or(`phone_norm.ilike.%${digits}%,phone.ilike.%${q}%`)
  } else {
    leadQuery = leadQuery.ilike('name', `%${q}%`)
  }

  const { data: matchedLeads, error: leadsErr } = await leadQuery
  if (leadsErr || !matchedLeads || matchedLeads.length === 0) {
    return NextResponse.json({ leads: [] })
  }

  const leadIds = (matchedLeads as LeadRow[]).map((l) => l.id)

  const { data: cycles, error: cycleErr } = await supabase
    .from('sales_cycles')
    .select('id,lead_id,created_at')
    .eq('company_id', profile.company_id)
    .in('lead_id', leadIds)
    .order('created_at', { ascending: false })

  if (cycleErr || !cycles || cycles.length === 0) {
    return NextResponse.json({ leads: [] })
  }

  const latestCycleByLead = new Map<string, CycleRow>()
  for (const cycle of cycles as CycleRow[]) {
    if (!latestCycleByLead.has(cycle.lead_id)) {
      latestCycleByLead.set(cycle.lead_id, cycle)
    }
  }

  const results = (matchedLeads as LeadRow[])
    .filter((lead) => latestCycleByLead.has(lead.id))
    .map((lead) => ({
      id: latestCycleByLead.get(lead.id)!.id,
      name: lead.name,
      phone: lead.phone,
    }))
    .slice(0, 8)

  return NextResponse.json({ leads: results })
}