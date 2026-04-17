import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

type LeadRow = {
  id: string
  name: string
  phone: string | null
  email: string | null
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

  if (!q) {
    return NextResponse.json({ leads: [] })
  }

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
  if (!auth?.user?.id) {
    return NextResponse.json({ leads: [] }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', auth.user.id)
    .single()

  if (!profile?.company_id) {
    return NextResponse.json({ leads: [] })
  }

  const companyId = profile.company_id
  const digits = q.replace(/\D/g, '')
  const isEmail = q.includes('@')
  const isDocument = digits.length === 11 || digits.length === 14
  const isPhoneLike = digits.length >= 6

  const matchedLeadIds = new Set<string>()

  // 1) Busca em leads por nome / telefone / email
  try {
    let leadSearch = supabase
      .from('leads')
      .select('id')
      .eq('company_id', companyId)
      .limit(20)

    if (isEmail) {
      leadSearch = leadSearch.ilike('email', `%${q}%`)
    } else if (isPhoneLike) {
      leadSearch = leadSearch.or(`phone_norm.ilike.%${digits}%,phone.ilike.%${q}%`)
    } else {
      leadSearch = leadSearch.ilike('name', `%${q}%`)
    }

    const { data: leadMatches } = await leadSearch
    for (const row of leadMatches ?? []) {
      if (row?.id) matchedLeadIds.add(row.id)
    }
  } catch (e) {
    console.error('Erro na busca base de leads:', e)
  }

  // 2) Busca documental em lead_profiles por CPF/CNPJ
  if (isDocument) {
    try {
      const { data: docMatches } = await supabase
        .from('lead_profiles')
        .select('lead_id')
        .eq('company_id', companyId)
        .or(`cpf.ilike.%${digits}%,cnpj.ilike.%${digits}%`)
        .limit(20)

      for (const row of docMatches ?? []) {
        if (row?.lead_id) matchedLeadIds.add(row.lead_id)
      }
    } catch (e) {
      console.error('Erro na busca por CPF/CNPJ:', e)
    }
  }

  const leadIds = Array.from(matchedLeadIds)
  if (leadIds.length === 0) {
    return NextResponse.json({ leads: [] })
  }

  // 3) Carrega dados dos leads encontrados
  const { data: leads, error: leadsErr } = await supabase
    .from('leads')
    .select('id,name,phone,email,updated_at')
    .eq('company_id', companyId)
    .in('id', leadIds)

  if (leadsErr || !leads || leads.length === 0) {
    return NextResponse.json({ leads: [] })
  }

  // 4) Descobre o ciclo mais recente de cada lead
  const { data: cycles, error: cycleErr } = await supabase
    .from('sales_cycles')
    .select('id,lead_id,created_at')
    .eq('company_id', companyId)
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

  const sortedLeads = [...(leads as LeadRow[])].sort((a, b) => {
    const aTime = a.updated_at ? new Date(a.updated_at).getTime() : 0
    const bTime = b.updated_at ? new Date(b.updated_at).getTime() : 0
    return bTime - aTime
  })

  const results = sortedLeads
    .filter((lead) => latestCycleByLead.has(lead.id))
    .map((lead) => ({
      id: latestCycleByLead.get(lead.id)!.id,
      name: lead.name,
      phone: lead.phone,
    }))
    .slice(0, 8)

  return NextResponse.json({ leads: results })
}