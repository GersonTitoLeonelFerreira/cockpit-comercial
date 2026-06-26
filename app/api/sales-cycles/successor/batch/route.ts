import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'

import { getAuthedSupabase } from '@/app/lib/supabase/server'

type AssignmentMode =
  | 'same_seller'
  | 'pool'
  | 'auto_balance'
  | 'specific_seller'

  type OpportunityType =
  | 'reativacao'
  | 'renovacao'
  | 'recompra'
  | 'upgrade'
  | 'novo_produto'

type TerminalStatus = 'ganho' | 'perdido'

type MembershipRow = {
  company_id: string
  role: string | null
  is_active: boolean | null
}

type SellerMembershipRow = {
  user_id: string
  role: string | null
  is_active: boolean | null
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  is_active_global: boolean | null
}

type GroupRow = {
  id: string
  name: string
}

type TerminalCycleRow = {
  id: string
  lead_id: string
  status: 'ganho' | 'perdido'
  owner_user_id: string | null
  won_owner_user_id: string | null
  lost_owner_user_id: string | null
  won_at: string | null
  lost_at: string | null
  updated_at: string | null
  created_at: string
}

type LeadRow = {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  deleted_at: string | null
}

type ActiveCycleRow = {
  id: string
  lead_id: string
  status: string | null
}

type SuccessorRpcResult = {
  success?: boolean
  error?: string
  cycle_id?: string
  lead_id?: string
  active_cycle_id?: string
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const OPPORTUNITY_TYPES: OpportunityType[] = [
  'reativacao',
  'renovacao',
  'recompra',
  'upgrade',
  'novo_produto',
]

const ASSIGNMENT_MODES: AssignmentMode[] = [
  'same_seller',
  'pool',
  'auto_balance',
  'specific_seller',
]

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeUuid(value: unknown) {
  const text = normalizeText(value)

  return UUID_REGEX.test(text) ? text : null
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Erro inesperado ao processar oportunidades.'
}

function getProfileLabel(profile: ProfileRow | undefined, fallbackId: string) {
  const fullName = profile?.full_name?.trim()

  if (fullName) {
    return fullName
  }

  const email = profile?.email?.trim()

  if (email) {
    return email
  }

  return `Usuário ${fallbackId.slice(0, 8)}`
}

function isOpportunityType(value: string): value is OpportunityType {
  return OPPORTUNITY_TYPES.includes(value as OpportunityType)
}

function isAssignmentMode(value: string): value is AssignmentMode {
  return ASSIGNMENT_MODES.includes(value as AssignmentMode)
}

function isTerminalStatus(status: string | null) {
  return status === 'ganho' || status === 'perdido'
}

function apiError(message: string, status = 400) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
    },
    {
      status,
    },
  )
}

async function getActorContext() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'ENV faltando: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  const { supabase, user } = await getAuthedSupabase()

  const cookieStore = await cookies()
  const activeCompanyId =
    cookieStore.get('cockpit_active_company_id')?.value ?? null

  if (!activeCompanyId) {
    throw new Error('Empresa ativa não selecionada.')
  }

  const { data: membershipRaw, error: membershipError } = await supabase
    .from('company_memberships')
    .select('company_id, role, is_active')
    .eq('company_id', activeCompanyId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle()

  if (membershipError) {
    throw new Error(membershipError.message)
  }

  const membership = membershipRaw as MembershipRow | null

  if (!membership?.company_id) {
    throw new Error('Usuário sem vínculo ativo com a empresa.')
  }

  const role = membership.role ?? 'member'

  if (role !== 'admin' && role !== 'manager') {
    throw new Error(
      'Apenas administradores ou gestores podem criar oportunidades em massa.',
    )
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  return {
    supabase,
    admin,
    user,
    companyId: membership.company_id,
  }
}

async function loadOptions(
  admin: ReturnType<typeof createClient>,
  companyId: string,
) {
  const { data: membershipsRaw, error: membershipsError } = await admin
    .from('company_memberships')
    .select('user_id, role, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true)

  if (membershipsError) {
    throw new Error(membershipsError.message)
  }

  const memberships = (membershipsRaw ?? []) as SellerMembershipRow[]

  const candidateSellerIds = memberships
    .filter(
      (membership) =>
        membership.role === 'member' || membership.role === 'manager',
    )
    .map((membership) => membership.user_id)

  const { data: profilesRaw, error: profilesError } =
    candidateSellerIds.length > 0
      ? await admin
          .from('profiles')
          .select('id, full_name, email, is_active_global')
          .in('id', candidateSellerIds)
      : {
          data: [],
          error: null,
        }

  if (profilesError) {
    throw new Error(profilesError.message)
  }

  const profiles = (profilesRaw ?? []) as ProfileRow[]
  const profileById = new Map(
    profiles
      .filter((profile) => profile.is_active_global !== false)
      .map((profile) => [profile.id, profile]),
  )

  const sellers = candidateSellerIds
    .filter((sellerId) => profileById.has(sellerId))
    .map((sellerId) => ({
      id: sellerId,
      label: getProfileLabel(profileById.get(sellerId), sellerId),
    }))
    .sort((first, second) =>
      first.label.localeCompare(second.label, 'pt-BR'),
    )

  const { data: groupsRaw, error: groupsError } = await admin
    .from('lead_groups')
    .select('id, name')
    .eq('company_id', companyId)
    .is('archived_at', null)
    .order('name')

  if (groupsError) {
    throw new Error(groupsError.message)
  }

  return {
    sellers,
    groups: (groupsRaw ?? []) as GroupRow[],
  }
}

export async function GET(request: Request) {
  try {
    const { admin, companyId } = await getActorContext()
    const requestUrl = new URL(request.url)

    const rawStatus = normalizeText(requestUrl.searchParams.get('status'))
    const rawSearch = normalizeText(requestUrl.searchParams.get('search'))
      .toLocaleLowerCase('pt-BR')

    const ownerUserId = normalizeUuid(
      requestUrl.searchParams.get('owner_user_id'),
    )

    if (rawStatus && rawStatus !== 'ganho' && rawStatus !== 'perdido') {
      return apiError('Filtro de status inválido.')
    }

    const { data: terminalCyclesRaw, error: terminalCyclesError } = await admin
      .from('sales_cycles')
      .select(
        'id, lead_id, status, owner_user_id, won_owner_user_id, lost_owner_user_id, won_at, lost_at, updated_at, created_at',
      )
      .eq('company_id', companyId)
      .in('status', ['ganho', 'perdido'])
      .order('updated_at', {
        ascending: false,
      })
      .limit(250)

    if (terminalCyclesError) {
      return apiError(terminalCyclesError.message)
    }

    const terminalCycles = (terminalCyclesRaw ?? []) as TerminalCycleRow[]
    const leadIds = Array.from(
      new Set(terminalCycles.map((cycle) => cycle.lead_id)),
    )

    const { data: leadsRaw, error: leadsError } = leadIds.length
      ? await admin
          .from('leads')
          .select('id, name, phone, email, deleted_at')
          .eq('company_id', companyId)
          .in('id', leadIds)
      : {
          data: [],
          error: null,
        }

    if (leadsError) {
      return apiError(leadsError.message)
    }

    const leadsById = new Map(
      ((leadsRaw ?? []) as LeadRow[])
        .filter((lead) => !lead.deleted_at)
        .map((lead) => [lead.id, lead]),
    )

    const { data: allCyclesRaw, error: allCyclesError } = leadIds.length
      ? await admin
          .from('sales_cycles')
          .select('id, lead_id, status')
          .eq('company_id', companyId)
          .in('lead_id', leadIds)
      : {
          data: [],
          error: null,
        }

    if (allCyclesError) {
      return apiError(allCyclesError.message)
    }

    const activeCycleByLeadId = new Map<string, string>()

    for (const cycle of (allCyclesRaw ?? []) as ActiveCycleRow[]) {
      if (!isTerminalStatus(cycle.status) && !activeCycleByLeadId.has(cycle.lead_id)) {
        activeCycleByLeadId.set(cycle.lead_id, cycle.id)
      }
    }

    const ownerIds = Array.from(
      new Set(
        terminalCycles
          .map((cycle) =>
            cycle.status === 'ganho'
              ? cycle.won_owner_user_id ?? cycle.owner_user_id
              : cycle.lost_owner_user_id ?? cycle.owner_user_id,
          )
          .filter((ownerId): ownerId is string => Boolean(ownerId)),
      ),
    )

    const { data: ownerProfilesRaw, error: ownerProfilesError } =
      ownerIds.length > 0
        ? await admin
            .from('profiles')
            .select('id, full_name, email, is_active_global')
            .in('id', ownerIds)
        : {
            data: [],
            error: null,
          }

    if (ownerProfilesError) {
      return apiError(ownerProfilesError.message)
    }

    const ownerProfilesById = new Map(
      ((ownerProfilesRaw ?? []) as ProfileRow[]).map((profile) => [
        profile.id,
        profile,
      ]),
    )

    const items = terminalCycles
      .map((cycle) => {
        const lead = leadsById.get(cycle.lead_id)

        if (!lead) {
          return null
        }

        const terminalOwnerId =
          cycle.status === 'ganho'
            ? cycle.won_owner_user_id ?? cycle.owner_user_id
            : cycle.lost_owner_user_id ?? cycle.owner_user_id

        const closedAt =
          cycle.status === 'ganho'
            ? cycle.won_at ?? cycle.updated_at ?? cycle.created_at
            : cycle.lost_at ?? cycle.updated_at ?? cycle.created_at

        return {
          cycle_id: cycle.id,
          lead_id: cycle.lead_id,
          name: lead.name?.trim() || 'Lead sem nome',
          phone: lead.phone,
          email: lead.email,
          status: cycle.status,
          closed_at: closedAt,
          terminal_owner_id: terminalOwnerId,
          terminal_owner_label: terminalOwnerId
            ? getProfileLabel(
                ownerProfilesById.get(terminalOwnerId),
                terminalOwnerId,
              )
            : 'Sem vendedor definido',
          active_cycle_id:
            activeCycleByLeadId.get(cycle.lead_id) ?? null,
        }
      })
      .filter(
        (
          item,
        ): item is {
          cycle_id: string
          lead_id: string
          name: string
          phone: string | null
          email: string | null
          status: TerminalStatus
          closed_at: string
          terminal_owner_id: string | null
          terminal_owner_label: string
          active_cycle_id: string | null
        } => item !== null,
      )
      .filter((item) => {
        if (rawStatus && item.status !== rawStatus) {
          return false
        }

        if (ownerUserId && item.terminal_owner_id !== ownerUserId) {
          return false
        }

        if (!rawSearch) {
          return true
        }

        const searchableText = [
          item.name,
          item.phone ?? '',
          item.email ?? '',
          item.terminal_owner_label,
        ]
          .join(' ')
          .toLocaleLowerCase('pt-BR')

        return searchableText.includes(rawSearch)
      })

      const options = await loadOptions(
        admin as unknown as ReturnType<typeof createClient>,
        companyId,
      )

    return NextResponse.json({
      ok: true,
      items,
      sellers: options.sellers,
      groups: options.groups,
      has_more: terminalCycles.length >= 250,
    })
  } catch (error: unknown) {
    const message = getErrorMessage(error)

    const status =
      message === 'Empresa ativa não selecionada.'
        ? 400
        : message.includes('Apenas administradores ou gestores')
          ? 403
          : message === 'Usuário sem vínculo ativo com a empresa.'
            ? 403
            : 500

    return apiError(message, status)
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, companyId } = await getActorContext()

    const body = (await request.json().catch(() => ({}))) as {
      source_cycle_ids?: unknown
      opportunity_type?: unknown
      assignment_mode?: unknown
      owner_user_id?: unknown
      group_id?: unknown
      note?: unknown
    }

    const rawCycleIds = Array.isArray(body.source_cycle_ids)
      ? body.source_cycle_ids
      : []

    const sourceCycleIds = Array.from(
      new Set(
        rawCycleIds
          .map((cycleId) => normalizeUuid(cycleId))
          .filter((cycleId): cycleId is string => cycleId !== null),
      ),
    )

    const opportunityType = normalizeText(body.opportunity_type).toLowerCase()
    const assignmentMode = normalizeText(body.assignment_mode).toLowerCase()
    const ownerUserId = normalizeUuid(body.owner_user_id)
    const groupId = normalizeUuid(body.group_id)
    const note = normalizeText(body.note).slice(0, 2000) || null

    if (sourceCycleIds.length === 0) {
      return apiError('Selecione pelo menos uma oportunidade.')
    }

    if (sourceCycleIds.length > 250) {
      return apiError('O limite máximo por lote é de 250 oportunidades.')
    }

    if (!isOpportunityType(opportunityType)) {
      return apiError('Tipo de oportunidade inválido.')
    }

    if (!isAssignmentMode(assignmentMode)) {
      return apiError('Destino da oportunidade inválido.')
    }

    if (assignmentMode === 'specific_seller' && !ownerUserId) {
      return apiError('Selecione o vendedor específico de destino.')
    }

    const created: Array<{
      source_cycle_id: string
      cycle_id: string
      lead_id: string
    }> = []

    const skipped: Array<{
      source_cycle_id: string
      reason: string
      active_cycle_id: string | null
    }> = []

    const failed: Array<{
      source_cycle_id: string
      reason: string
    }> = []

    for (const sourceCycleId of sourceCycleIds) {
      const { data, error } = await supabase.rpc(
        'rpc_create_successor_cycle_for_company',
        {
          p_company_id: companyId,
          p_source_cycle_id: sourceCycleId,
          p_opportunity_type: opportunityType,
          p_assignment_mode: assignmentMode,
          p_owner_user_id: ownerUserId,
          p_group_id: groupId,
          p_note: note,
        },
      )

      if (error) {
        failed.push({
          source_cycle_id: sourceCycleId,
          reason: error.message,
        })
        continue
      }

      const result = (data ?? {}) as SuccessorRpcResult

      if (result.success && result.cycle_id && result.lead_id) {
        created.push({
          source_cycle_id: sourceCycleId,
          cycle_id: result.cycle_id,
          lead_id: result.lead_id,
        })
        continue
      }

      if (result.error === 'active_cycle_exists') {
        skipped.push({
          source_cycle_id: sourceCycleId,
          reason: 'active_cycle_exists',
          active_cycle_id: result.active_cycle_id ?? null,
        })
        continue
      }

      failed.push({
        source_cycle_id: sourceCycleId,
        reason: result.error ?? 'successor_cycle_creation_failed',
      })
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      failed,
    })
  } catch (error: unknown) {
    const message = getErrorMessage(error)

    const status =
      message === 'Empresa ativa não selecionada.'
        ? 400
        : message.includes('Apenas administradores ou gestores')
          ? 403
          : message === 'Usuário sem vínculo ativo com a empresa.'
            ? 403
            : 500

    return apiError(message, status)
  }
}