import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import PulsoComercialClient from './PulsoComercialClient'
import { buildSalesPulsePageData } from '@/app/lib/services/sales-pulse'
import type { SalesPulseCycleRow } from '@/app/types/sales-pulse'
import type { LeadStatus } from '@/app/types/sales_cycles'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type PipelinePulseRow = {
  id: string
  company_id: string
  lead_id: string
  owner_id: string | null
  status: LeadStatus
  stage_entered_at: string | null
  next_action: string | null
  next_action_date: string | null
  created_at: string
  name: string | null
  phone: string | null
  email: string | null
}

function mapPipelineRowToPulseRow(row: PipelinePulseRow): SalesPulseCycleRow {
  return {
    id: row.id,
    company_id: row.company_id,
    lead_id: row.lead_id,
    owner_user_id: row.owner_id,
    status: row.status,
    previous_status: null,
    stage_entered_at: row.stage_entered_at,
    next_action: row.next_action,
    next_action_date: row.next_action_date,
    current_group_id: null,
    created_at: row.created_at,
    updated_at: row.stage_entered_at ?? row.created_at,
    closed_at: null,
    won_at: null,
    lost_at: null,
    lost_reason: null,
    leads: {
      id: row.lead_id,
      name: row.name,
      phone: row.phone,
      email: row.email,
    },
  }
}

async function getPulsoComercialData() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !anon || !serviceKey) {
    throw new Error(
      'ENV faltando: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY ou SUPABASE_SERVICE_ROLE_KEY.'
    )
  }

  const cookieStore = await cookies()
  const activeCompanyId = cookieStore.get('cockpit_active_company_id')?.value ?? null

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll() {},
    },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user?.id) redirect('/login')
  if (!activeCompanyId) redirect('/select-company')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, is_active_global')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    throw new Error(`Erro ao validar perfil: ${profileError.message}`)
  }

  if (!profile?.id || profile.is_active_global === false) {
    redirect('/login')
  }

  const { data: actorMembership, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) {
    throw new Error(`Erro ao validar vínculo com a empresa: ${membershipError.message}`)
  }

  const membership = actorMembership as MembershipRow | null

  if (!membership?.company_id) {
    redirect('/select-company')
  }

  const admin = createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const canViewCompany = membership.role === 'admin' || membership.role === 'manager'

  let query = admin
    .from('v_pipeline_items')
    .select(
      'id, company_id, lead_id, owner_id, status, stage_entered_at, next_action, next_action_date, created_at, name, phone, email'
    )
    .eq('company_id', activeCompanyId)
    .in('status', ['contato', 'respondeu', 'negociacao'])
    .order('stage_entered_at', { ascending: true, nullsFirst: false })
    .limit(500)

  if (canViewCompany) {
    const { data: activeOwners, error: activeOwnersError } = await admin
      .from('company_memberships')
      .select('user_id')
      .eq('company_id', activeCompanyId)
      .eq('is_active', true)

    if (activeOwnersError) {
      throw new Error(`Erro ao carregar vendedores ativos: ${activeOwnersError.message}`)
    }

    const ownerIds = ((activeOwners ?? []) as Array<{ user_id: string }>)
      .map((owner) => owner.user_id)
      .filter(Boolean)

    if (ownerIds.length === 0) {
      return buildSalesPulsePageData([], { limit: 80 })
    }

    query = query.not('owner_id', 'is', null).in('owner_id', ownerIds)
  } else {
    query = query.eq('owner_id', user.id)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(`Erro ao carregar Pulso Comercial: ${error.message}`)
  }

  const rows = ((data ?? []) as PipelinePulseRow[]).map(mapPipelineRowToPulseRow)

  return buildSalesPulsePageData(rows, { limit: 80 })
}

export default async function PulsoComercialPage() {
  const data = await getPulsoComercialData()

  return <PulsoComercialClient data={data} />
}
